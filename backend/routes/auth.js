'use strict';
const express   = require('express');
const crypto    = require('crypto');
const fs        = require('fs');
const path      = require('path');
const jwt       = require('jsonwebtoken');
const bcrypt    = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const profileStore = require('../services/user-profile-store');
const {sessionIdentity,sessionRevocations}=require('../services/session-revocations');
const { accountKey, anonymousKey } = require('../lib/resource-limits');

const router = express.Router();

// Protección brute-force: máximo 8 intentos por 15 minutos por IP
const loginLimiter = rateLimit({
    keyGenerator: anonymousKey,
    windowMs: 15 * 60 * 1000,
    max: 8,
    skipSuccessfulRequests: true,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'Demasiados intentos de login. Espera 15 minutos.' },
});

// Sin secreto no hay forma segura de firmar ni verificar tokens: un valor por
// defecto permitiría a cualquiera que lo conozca forjar una sesión válida. Se
// aborta la carga del módulo en lugar de continuar con un secreto público.
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || Buffer.byteLength(JWT_SECRET)<32) {
    throw new Error(
        'JWT_SECRET requiere al menos 32 bytes. Defínelo en backend/.env (local) o en las ' +
        'variables de entorno del despliegue antes de arrancar.'
    );
}
const JWT_EXPIRES = '8h';
const ENV_PATH    = path.join(__dirname, '..', '.env');
const DUMMY_PASSWORD_HASH = bcrypt.hash('vall-invalid-account', 10);

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Comparación en tiempo constante para strings — normaliza longitud para evitar timing attack */
function safeCompare(a, b) {
    const bufA = Buffer.from(String(a));
    const bufB = Buffer.from(String(b));
    const len  = Math.max(bufA.length, bufB.length);
    const padA = Buffer.concat([bufA, Buffer.alloc(len - bufA.length)]);
    const padB = Buffer.concat([bufB, Buffer.alloc(len - bufB.length)]);
    return crypto.timingSafeEqual(padA, padB) && bufA.length === bufB.length;
}

/** Detecta si un string ya es un hash bcrypt */
function isBcryptHash(str) {
    return typeof str === 'string' && str.startsWith('$2');
}

/**
 * Lee las credenciales de acceso desde los nombres exclusivos de VALL y conserva
 * USER_EMAIL/USER_PASSWORD como compatibilidad para instalaciones existentes.
 * Los prefijos evitan que una variable heredada o integrada de un proveedor de
 * hosting reemplace silenciosamente la configuración de inicio de sesión.
 */
function configuredCredentials() {
    const emailFromVall = process.env.VALL_AUTH_EMAIL;
    const passwordFromVall = process.env.VALL_AUTH_PASSWORD;
    return {
        email:    (emailFromVall || process.env.USER_EMAIL || '').trim(),
        password: passwordFromVall || process.env.USER_PASSWORD || '',
        source:   passwordFromVall ? 'VALL_AUTH_PASSWORD' : 'USER_PASSWORD',
    };
}

// Recuperación exclusivamente local durante una interrupción del almacén de
// perfiles: exige las credenciales configuradas y expira en cinco minutos.
// Producción consulta siempre el perfil activo y su versión de credenciales.
function fallbackAdminProfile(email) {
    const digest = crypto.createHash('sha256').update(`vall-admin:${email}`).digest('hex');
    const id = `${digest.slice(0, 8)}-${digest.slice(8, 12)}-4${digest.slice(13, 16)}-a${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
    return {
        id,
        email,
        role: 'admin',
        displayName: 'Administrador',
        preferences: {},
        trainingOptIn: true,
        active: true,
        persistenceDegraded: true,
        localRecovery:true,
    };
}

/** Mutex simple para escrituras concurrentes al .env */
let _envWriting = false;

/** Actualiza USER_PASSWORD en el .env y en process.env */
function updateEnvPassword(newValue) {
    // Salir en silencio dejaba que quien llamara respondiera "éxito" sin haber
    // escrito nada: el usuario creía haber cambiado su contraseña y no era así.
    if (_envWriting) {
        const err = new Error('Otra actualización de contraseña está en curso. Intenta de nuevo en unos segundos.');
        err.code = 'ENV_WRITE_BUSY';
        throw err;
    }
    _envWriting = true;
    try {
        let envContent = '';
        try { envContent = fs.readFileSync(ENV_PATH, 'utf8'); } catch { /* .env puede no existir */ }

        if (/^USER_PASSWORD=.*/m.test(envContent)) {
            envContent = envContent.replace(/^USER_PASSWORD=.*/m, `USER_PASSWORD=${newValue}`);
        } else {
            envContent += `\nUSER_PASSWORD=${newValue}`;
        }
        fs.writeFileSync(ENV_PATH, envContent, 'utf8');
        process.env.USER_PASSWORD = newValue;
    } finally {
        _envWriting = false;
    }
}

/**
 * Migra la contraseña de texto plano a hash bcrypt.
 * Se llama al arrancar el servidor y después de un login exitoso con contraseña en plano.
 * Sólo para desarrollo local: producción administra la credencial en el hosting.
 */
async function migratePasswordIfNeeded(storedPassword) {
    if (!storedPassword || isBcryptHash(storedPassword)) return;
    if (process.env.VERCEL || process.env.NODE_ENV === 'production') return;
    // El adaptador antiguo solo puede migrar USER_PASSWORD. El login también
    // admite VALL_AUTH_PASSWORD, administrada por el despliegue: escribir su
    // hash en USER_PASSWORD dejaría dos credenciales diferentes en circulación.
    const configured = configuredCredentials();
    if (configured.source !== 'USER_PASSWORD' || configured.password !== storedPassword) return;
    try {
        const hashed = await bcrypt.hash(storedPassword, 10);
        // El cálculo es asíncrono: no sobrescribir un cambio de contraseña o
        // una nueva configuración que haya ocurrido mientras se generaba el hash.
        const current = configuredCredentials();
        if (current.source !== 'USER_PASSWORD' || current.password !== storedPassword) return;
        updateEnvPassword(hashed);
        console.log('  [auth] Contraseña migrada a bcrypt hash correctamente.');
    } catch (e) {
        console.error('  [auth] Error al migrar contraseña:', e.message);
    }
}

/** Verifica una contraseña contra el valor almacenado (hash o texto plano legacy) */
async function verifyPassword(input, stored) {
    if (!stored) return false;
    if (isBcryptHash(stored)) return bcrypt.compare(input, stored);
    // Fallback texto plano (se migrará tras el primer login exitoso)
    return safeCompare(input, stored);
}

// ── Middleware: verificar JWT ──────────────────────────────────────────────────

function sessionClaims(req) {
    if (req.verifiedSession) return req.verifiedSession;
    const token = req.cookies?.vn_token
        || (req.headers.authorization || '').match(/^Bearer ([\w.-]+)$/i)?.[1];
    if (typeof token !== 'string' || !token || token.length > 4096) throw new Error('No autenticado');
    const claims = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'], maxAge: '8h' });
    if (typeof claims.sub !== 'string' || !claims.sub) throw new Error('Identidad inválida');
    req.verifiedSession = claims;
    return claims;
}
function localRecoveryAllowed(){return !process.env.VERCEL && process.env.NODE_ENV!=='production';}
function recoveryVersion(){const credentials=configuredCredentials();return crypto.createHmac('sha256',JWT_SECRET).update(credentials.email.toLowerCase()+'\0'+credentials.password).digest('hex');}

// Caché breve de perfiles: una carga de página dispara decenas de peticiones
// autenticadas y cada una consultaba la base. El TTL corto limita cuánto tarda
// en notarse una cuenta desactivada o un cambio de credenciales.
const PROFILE_CACHE_TTL = 15 * 1000;
const PROFILE_CACHE_MAX = 2000;
const profileCache = new Map();
const profileInflight = new Map();
function invalidateProfileCache(id) { if (id) profileCache.delete(id); else profileCache.clear(); }
async function cachedProfile(id) {
    const hit = profileCache.get(id);
    if (hit && hit.expires > Date.now()) return hit.profile;
    if (profileInflight.has(id)) return profileInflight.get(id);
    const request = profileStore.findById(id).then(found => {
        if (profileCache.size >= PROFILE_CACHE_MAX) profileCache.delete(profileCache.keys().next().value);
        profileCache.set(id, { profile: found, expires: Date.now() + PROFILE_CACHE_TTL });
        return found;
    }).finally(() => profileInflight.delete(id));
    profileInflight.set(id, request);
    return request;
}

async function verifyToken(req, res, next) {
    try {
        req.user = sessionClaims(req);
        try{if(await sessionRevocations.isRevoked(sessionIdentity(req.user)))throw Object.assign(Error('Sesión revocada'),{revoked:true});}catch(error){if(error.revoked)throw error;return res.status(503).json({success:false,error:'No se pudo comprobar la vigencia de la sesión. Reintenta.'});}
        {
            let current;
            try { current=await cachedProfile(req.user.sub);if(!current && req.user.localRecovery)current=await profileStore.findByEmail(req.user.email); }
            catch (profileErr) {
                if(localRecoveryAllowed() && req.user.localRecovery===true && req.user.role==='admin' && req.user.sub===fallbackAdminProfile(configuredCredentials().email.toLowerCase()).id && safeCompare(req.user.recoveryVersion || '',recoveryVersion()) && Date.now()/1000-req.user.iat<=300) {
                    current=fallbackAdminProfile(configuredCredentials().email.toLowerCase());
                } else {
                    return res.status(503).json({success:false,error:'El servicio de perfiles no está disponible temporalmente.'});
                }
            }
            const version=Object.hasOwn(req.user,'credentialVersion') ? req.user.credentialVersion : 0;
            if(!Number.isInteger(version) || version<0 || !current?.active || (current.credentialVersion||0)!==version
                || current.email.toLowerCase()!==String(req.user.email||'').toLowerCase()) throw Error('Sesión de cuenta inválida');
            req.currentProfile=current;
            req.user={...req.user,role:current.role || 'user',trainingOptIn:current.trainingOptIn===true};
        }
        res.set('Cache-Control', 'private, no-store');
        res.set('X-VALL-Account',req.user.email);
        const expectedAccount=req.headers['x-vall-account'];
        if(expectedAccount && (typeof expectedAccount!=='string' || expectedAccount.trim().toLowerCase()!==String(req.user.email).toLowerCase()))return res.status(409).json({success:false,code:'ACCOUNT_CHANGED',error:'La sesión cambió de cuenta. Recarga la cuenta para continuar.'});
        next();
    } catch {
        res.status(401).json({ success: false, error: 'Token inválido o expirado' });
    }
}

// Migración automática al arrancar (no bloquea el startup). Las credenciales
// administradas por el hosting no deben escribirse desde el proceso serverless.
setImmediate(() => {
    const credentials = configuredCredentials();
    if (credentials.source === 'USER_PASSWORD') migratePasswordIfNeeded(credentials.password);
});

function issueSession(req,res,currentProfile) {
    const claims={sub:currentProfile.id,email:currentProfile.email,role:currentProfile.role,trainingOptIn:currentProfile.trainingOptIn};
    claims.credentialVersion=Number.isInteger(currentProfile.credentialVersion) ? currentProfile.credentialVersion : 0;
    const recovery=currentProfile.localRecovery===true;
    if(recovery){claims.localRecovery=true;claims.recoveryVersion=recoveryVersion();}
    const token=jwt.sign(claims,JWT_SECRET,{expiresIn:recovery?'5m':JWT_EXPIRES,jwtid:crypto.randomUUID()});
    res.cookie('vn_token',token,{httpOnly:true,secure:process.env.NODE_ENV==='production'||!!process.env.VERCEL||req.secure,
        sameSite:'lax',path:'/',maxAge:recovery?5*60*1000:8*60*60*1000});
}
const passwordLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 8,
    keyGenerator: accountKey, standardHeaders: true, legacyHeaders: false,
    message: { success: false, error: 'Demasiados intentos de cambio de contraseña. Intenta más tarde.' } });

// ── Rutas ─────────────────────────────────────────────────────────────────────

router.post('/login', loginLimiter, async (req, res) => {
    try {
        const { email, password } = req.body || {};
        if (typeof email !== 'string' || typeof password !== 'string' || !email.trim() || !password)
            return res.status(400).json({ success: false, error: 'Credenciales requeridas.' });
        if (email.length > 254 || Buffer.byteLength(password, 'utf8') > 72)
            return res.status(400).json({ success: false, error: 'Credenciales demasiado largas.' });

        const normalizedEmail = String(email).trim().toLowerCase();
        const credentials = configuredCredentials();
        const isAdminEmail = credentials.email && safeCompare(normalizedEmail, credentials.email.toLowerCase());
        let currentProfile;
        let passOk = false;
        if (isAdminEmail) {
            passOk = await verifyPassword(password, credentials.password);
            if (passOk) {
                try {
                    currentProfile = await profileStore.upsertAdmin(normalizedEmail, 'Administrador', isBcryptHash(credentials.password) ? credentials.password : null);
                } catch (profileError) {
                    if(!localRecoveryAllowed())return res.status(503).json({success:false,error:'El servicio de perfiles no está disponible temporalmente.'});
                    console.warn('[auth] Supabase no disponible para el perfil administrador; se mantiene el acceso seguro sin persistencia remota:', profileError.message);
                    currentProfile = fallbackAdminProfile(normalizedEmail);
                }
                if (!isBcryptHash(credentials.password)) migratePasswordIfNeeded(credentials.password).catch(() => {});
            }
        } else {
            try {
                currentProfile = await profileStore.findByEmail(normalizedEmail);
            } catch (profileError) {
                console.warn('[auth] No se pudo consultar el perfil de usuario:', profileError.message);
                return res.status(503).json({ success: false, error: 'El servicio de perfiles no está disponible temporalmente.' });
            }
            passOk = currentProfile?.active && currentProfile.passwordHash
                ? await bcrypt.compare(password, currentProfile.passwordHash)
                : await bcrypt.compare(password, await DUMMY_PASSWORD_HASH).then(() => false);
        }
        if (!passOk || !currentProfile?.active) return res.status(401).json({ success: false, error: 'Correo o contraseña incorrectos.' });
        await profileStore.markLogin(currentProfile.id).catch(error => console.warn('[auth] No se actualizó last_login_at:', error.message));

        issueSession(req,res,currentProfile);
        // La cookie httpOnly es el único portador de sesión necesario. Devolver
        // el JWT en el cuerpo haría que el navegador tuviera que exponerlo a
        // JavaScript (y por tanto a cualquier XSS) sin aportar nada a la API.
        res.json({
            success: true,
            email: currentProfile.email,
            role: currentProfile.role,
            displayName: currentProfile.displayName,
            profilePersistence: currentProfile.persistenceDegraded ? 'local' : 'supabase',
        });
    } catch (err) {
        console.error('/api/login error:', err.message);
        res.status(500).json({ success: false, error: 'Error interno del servidor.' });
    }
});

router.post('/logout', async (req, res) => {
    res.set('Cache-Control','private, no-store');
    let claims;try{claims=sessionClaims(req);}catch{ /* Invalid or expired tokens cannot be replayed. */ }
    if(claims)try{await sessionRevocations.revoke(sessionIdentity(claims));}catch{return res.status(503).json({success:false,error:'No se pudo confirmar el cierre de sesión. Reintenta.'});}
    res.clearCookie('vn_token');
    res.json({ success: true });
});

router.get('/verify-token', verifyToken, (req, res) => {
    res.json({ success: true, email: req.user.email, role: req.user.role || 'user', userId: req.user.sub || null });
});

async function sessionProfile(claims) {
    const current = await profileStore.findById(claims.sub);
    if (current) return current.email.toLowerCase() === String(claims.email || '').toLowerCase() ? current : null;
    // A login during an outage issues a deterministic administrator ID. Onc
    // storage recovers, resolve that signed identity to its real profile.
    const email = String(claims.email || '').trim().toLowerCase();
    const configured = configuredCredentials().email?.toLowerCase();
    if (claims.role !== 'admin' || !configured || email !== configured || claims.sub !== fallbackAdminProfile(email).id) return null;
    return await profileStore.findByEmail(email) || await profileStore.upsertAdmin(email, 'Administrador');
}

async function requireProfileAdmin(req,res,next) {
    try {
        if(req.user.role!=='admin') return res.status(403).json({success:false,error:'Solo el administrador puede gestionar perfiles.'});
        const actor=await sessionProfile(req.user);
        if(!actor?.active || actor.role!=='admin') return res.status(403).json({success:false,error:'No tienes permiso para gestionar perfiles.'});
        req.profileAdmin=actor;next();
    } catch {res.status(503).json({success:false,error:'No se pudo conectar con los perfiles. Reintenta.'});}
}

router.get('/admin/loopus-proposals', verifyToken, requireProfileAdmin, async (req, res) => {
    try {
        const { listRuleProposals } = require('../ai/ml-persistence');
        const status = typeof req.query?.status === 'string' ? req.query.status : null;
        const proposals = await listRuleProposals({ status, limit: req.query?.limit });
        res.set('Cache-Control', 'private, no-store');
        res.json({ success: true, proposals });
    } catch {
        res.status(503).json({ success: false, error: 'No se pudieron cargar las propuestas de Proyecto Loopus.' });
    }
});

router.post('/admin/loopus-proposals/:id/review', verifyToken, requireProfileAdmin, express.json({ limit: '8kb' }), async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({ success: false, error: 'Identificador de propuesta inválido.' });
        const status = req.body?.status;
        if (!['approved', 'rejected', 'pending_human_review'].includes(status)) {
            return res.status(400).json({ success: false, error: 'Estado inválido. Usa approved, rejected o pending_human_review.' });
        }
        const { reviewRuleProposal } = require('../ai/ml-persistence');
        const updated = await reviewRuleProposal(id, { status, reviewNotes: req.body?.reviewNotes });
        res.set('Cache-Control', 'private, no-store');
        res.json({ success: true, proposal: updated });
    } catch (error) {
        const code = Number.isInteger(error?.status) ? error.status : 503;
        res.status(code).json({ success: false, error: error?.message || 'No se pudo actualizar la propuesta.' });
    }
});

router.get('/admin/profiles',verifyToken,requireProfileAdmin,async(req,res)=>{
    try {res.json({success:true,profiles:await profileStore.listProfiles()});}
    catch {res.status(503).json({success:false,error:'No se pudieron cargar los perfiles.'});}
});

router.post('/admin/profiles/:id/password',verifyToken,requireProfileAdmin,passwordLimiter,async(req,res)=>{
    try {
        if(!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(req.params.id)) return res.status(400).json({success:false,error:'Perfil inválido.'});
        const password=req.body?.newPassword;
        if(typeof password!=='string'||password.length<8||Buffer.byteLength(password,'utf8')>72) return res.status(400).json({success:false,error:'Usa al menos 8 caracteres y hasta 72 bytes.'});
        const target=await profileStore.findById(req.params.id);
        if(!target) return res.status(404).json({success:false,error:'Perfil no encontrado.'});
        if(target.role==='admin') return res.status(409).json({success:false,error:'La contraseña del administrador se gestiona desde la configuración segura del despliegue.'});
        await profileStore.updatePassword(target.id,await bcrypt.hash(password,12));invalidateProfileCache(target.id);
        res.json({success:true});
    } catch {res.status(503).json({success:false,error:'No se pudo confirmar el cambio de contraseña. Revisa la conexión antes de volver a intentarlo.'});}
});

router.get('/profile', verifyToken, async (req, res) => {
    try {
        const current = await sessionProfile(req.user);
        if (!current || !current.active) return res.status(404).json({ success: false, error: 'Perfil no encontrado.' });
        res.set('Cache-Control', 'private, no-store');
        res.json({ success: true, profile: { email: current.email, role: current.role, displayName: current.displayName, preferences: current.preferences, trainingOptIn: current.trainingOptIn } });
    } catch (error) {
        console.error('/api/profile:', error.message);
        res.set('Retry-After', '5');
        res.status(503).json({ success: false, error: 'El servicio de ajustes no está disponible temporalmente.' });
    }
});

router.post('/profile', verifyToken, express.json({ limit: '16kb' }), async (req, res) => {
    try {
        const current = await sessionProfile(req.user);
        if (!current || !current.active) return res.status(404).json({ success: false, error: 'Perfil no encontrado.' });
        const incoming = req.body?.preferences && typeof req.body.preferences === 'object' && !Array.isArray(req.body.preferences) ? req.body.preferences : {};
        const preferences = { ...(current.preferences || {}), ...incoming };
        if (Object.hasOwn(incoming, 'executiveReports')) preferences.executiveReports = require('../lib/executive-report-preferences').normalizePreferences(incoming.executiveReports);
        if (Object.hasOwn(incoming, 'businessProfile')) preferences.businessProfile = require('../lib/business-profile').normalizeBusinessProfile(incoming.businessProfile);
        if (Object.hasOwn(incoming, 'reportLearning')) preferences.reportLearning = require('../lib/report-interests').normalizeLearning(incoming.reportLearning);
        const updated = await profileStore.updateProfile(current.id, {
            displayName: typeof req.body?.displayName === 'string' ? req.body.displayName : current.displayName,
            preferences,
            preferencePatch:Object.fromEntries(Object.keys(incoming).map(key=>[key,preferences[key]])),
            trainingOptIn: typeof req.body?.trainingOptIn === 'boolean' ? req.body.trainingOptIn : current.trainingOptIn,
        });
        invalidateProfileCache(current.id);
        res.json({ success: true, profile: { email: updated.email, role: updated.role, displayName: updated.displayName, preferences: updated.preferences, trainingOptIn: updated.trainingOptIn } });
    } catch (error) {
        console.error('/api/profile POST:', error.message);
        res.set('Retry-After', '5');
        res.status(503).json({ success: false, error: 'No se pudieron sincronizar los ajustes. Reintenta.' });
    }
});

router.post('/change-password', verifyToken, passwordLimiter, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body || {};
        if (typeof currentPassword !== 'string' || typeof newPassword !== 'string' || !currentPassword || !newPassword)
            return res.status(400).json({ success: false, error: 'Faltan campos requeridos.' });
        if (newPassword.length < 6)
            return res.status(400).json({ success: false, error: 'La contraseña debe tener al menos 6 caracteres.' });
        if (Buffer.byteLength(currentPassword, 'utf8') > 72 || Buffer.byteLength(newPassword, 'utf8') > 72)
            return res.status(400).json({ success: false, error: 'La contraseña admite hasta 72 bytes.' });

        const credentials = configuredCredentials();
        const isAdmin = req.user.role === 'admin' && safeCompare(String(req.user.email).toLowerCase(), credentials.email.toLowerCase());
        if (!isAdmin) {
            const current = await profileStore.findById(req.user.sub);
            if (!current?.passwordHash || !await bcrypt.compare(currentPassword, current.passwordHash))
                return res.status(401).json({ success: false, error: 'La contraseña actual es incorrecta.' });
            const version=await profileStore.updatePassword(current.id, await bcrypt.hash(newPassword, 12));invalidateProfileCache(current.id);
            issueSession(req,res,{...current,...(Number.isInteger(version)?{credentialVersion:version}:{})});
            return res.json({ success: true });
        }
        // Los contenedores reciben las credenciales del despliegue: escribir
        // su .env sólo cambiaría la instancia actual y se perdería al recrearla.
        if (process.env.VERCEL || process.env.NODE_ENV === 'production' || credentials.source !== 'USER_PASSWORD') {
            return res.status(409).json({
                success: false,
                code: 'PASSWORD_MANAGED_BY_DEPLOYMENT',
                error: 'La contraseña del administrador se administra desde la configuración segura del despliegue. Actualízala allí y vuelve a desplegar para guardar el cambio de forma permanente.',
            });
        }

        const storedPassword = credentials.password;
        const valid = await verifyPassword(currentPassword, storedPassword);
        if (!valid)
            return res.status(401).json({ success: false, error: 'La contraseña actual es incorrecta.' });

        // Siempre guardar la nueva contraseña como hash bcrypt
        const hashed = await bcrypt.hash(newPassword, 10);
        updateEnvPassword(hashed);

        res.json({ success: true });
    } catch (err) {
        console.error('/api/change-password error:', err.message);
        if (err.code === 'ENV_WRITE_BUSY')
            return res.status(409).json({ success: false, error: err.message });
        // Contenedores de solo lectura o réplicas: .env no es un almacén válido.
        if (['EROFS', 'EACCES', 'EPERM'].includes(err.code))
            return res.status(409).json({ success: false, error: 'La contraseña se administra desde la configuración segura del despliegue (VALL_AUTH_PASSWORD).' });
        res.status(500).json({ success: false, error: 'Error interno al cambiar la contraseña.' });
    }
});

module.exports = { router, verifyToken, sessionClaims, invalidateProfileCache };

import { useMemo, useState } from 'react';
import {
  ESPECIES_CANAL, especieCanal, cortesDe,
} from '../lib/cortes-canal.js';
import {
  consumoPersonaDe, despojosDe, paisesConConsumo, ANIO, FUENTE,
} from '../lib/proteinas-mapa.js';
import { nombreEs } from '../lib/paises-es.js';

/*
 * «De qué parte del animal»: el despiece de una res, un cerdo o un pollo, y
 * cuántos kilos de cada corte le tocan al año a una persona del país elegido.
 *
 * ── Lo que este bloque NO puede hacer, y por qué lo dice en pantalla ───────
 * No existe publicado el consumo por CORTE y por país. Ni la FAO (que desglosa
 * la carne en cuatro partidas de especie y ninguna más) ni el PSD del USDA (que
 * llega hasta producción y consumo por especie) lo tienen, y no hay serie
 * nacional comparable. Ver el contrato entero en lib/cortes-canal.js.
 *
 * Así que el bloque separa dos cosas que se podrían confundir, y las separa
 * también visualmente:
 *
 *   · El REPARTO (%) es el rendimiento técnico de la canal. Es anatomía y sala
 *     de corte, prácticamente igual en todo el mundo. No cambia con el país, y
 *     el pie lo dice con todas las letras.
 *   · Los KILOS sí son del país: salen de multiplicar ese reparto por el
 *     consumo real de esa carne por habitante (FAO). Cambiar de país cambia el
 *     tamaño del animal que le toca a cada persona, no su anatomía.
 *
 * Y para que la pregunta «¿y aquí qué partes se comen?» tenga una respuesta
 * MEDIDA, el bloque termina con vísceras y grasa animal, que son las únicas
 * partes que la FAO sí publica país a país — y las que de verdad separan unas
 * cocinas de otras: de décimas de kilo a los 32.5 de Mongolia.
 *
 * ── Una sola tinta en las barras ───────────────────────────────────────────
 * Los cortes son categorías sin orden natural y la barra ya codifica su tamaño
 * con la longitud. Pintarlas con una rampa —más oscuro donde más pesa— gastaría
 * el canal del color en repetir lo que la longitud ya dice. Una tinta para
 * todas, y el color se reserva para lo que sí distingue: el corte señalado.
 */

const fmt = (v, d = 1) => v.toLocaleString('es-MX', { minimumFractionDigits: d, maximumFractionDigits: d });

/* Siluetas de trazo propio y no iconos de fuente: hacen falta a ~190 px y de
   perfil, que es lo que dice de qué animal se habla antes de leer nada. Font
   Awesome Free no trae cerdo ni ave de perfil.
 *
 * ── Un CONTORNO continuo, no un montón de piezas ──────────────────────────
 * La primera versión armaba cada animal con rectángulos y rectángulos
 * redondeados —cuerpo, cabeza, cuatro patas— y se notaba: parecían piezas
 * apiladas, no un animal. Ahora cada uno es UN solo trazo que recorre morro,
 * frente, lomo, grupa, patas y vientre de una vez, con las curvas donde el
 * animal las tiene. Solo van aparte las cosas que de verdad se superponen:
 * cuernos, orejas, cola y el par de patas del lado de allá.
 *
 * Las patas traseras del lado opuesto van en un tono más apagado (`.ca-lejos`)
 * en vez de fundidas con el cuerpo: sin esa separación, ocho patas del mismo
 * color se leen como una fila de postes.
 */
const SILUETAS = {
  /* La vaca es de Font Awesome (`svgs/solid/cow.svg`, 6.5.2), no dibujada aquí.
     Cuatro intentos propios y ninguno pasó: la cabeza y el cuerpo se solapaban
     y salía un hipopótamo, y al separarlos con un cuello largo salía un oso
     hormiguero. El paquete `@fortawesome/fontawesome-free` ya es dependencia
     del proyecto y trae la vaca dibujada, en el mismo lenguaje plano y macizo
     que el cerdo y el pollo de aquí al lado, así que se usa esa.
     No hay pig ni chicken de perfil en el paquete —comprobado sobre
     svgs/solid/—, y por eso esos dos siguen siendo propios.
     Su viewBox es 640×512. Va ESPEJADA (escala negativa en x) porque el
     original mira a la derecha y aquí los tres animales miran a la izquierda:
     con uno mirando al revés, el conmutador parece cambiar de dibujo y no de
     animal. El translate la deja centrada con el mismo margen que las otras. */
  res: (
    <g transform="translate(114.4 5.5) scale(-0.17 0.17)">
      <path d="M96 224v32V416c0 17.7 14.3 32 32 32h32c17.7 0 32-14.3 32-32V327.8c9.9 6.6 20.6 12 32 16.1V368c0 8.8 7.2 16 16 16s16-7.2 16-16V351.1c5.3 .6 10.6 .9 16 .9s10.7-.3 16-.9V368c0 8.8 7.2 16 16 16s16-7.2 16-16V343.8c11.4-4 22.1-9.4 32-16.1V416c0 17.7 14.3 32 32 32h32c17.7 0 32-14.3 32-32V256l32 32v49.5c0 9.5 2.8 18.7 8.1 26.6L530 427c8.8 13.1 23.5 21 39.3 21c22.5 0 41.9-15.9 46.3-38l20.3-101.6c2.6-13-.3-26.5-8-37.3l-3.9-5.5V184c0-13.3-10.7-24-24-24s-24 10.7-24 24v14.4l-52.9-74.1C496 86.5 452.4 64 405.9 64H272 256 192 144C77.7 64 24 117.7 24 184v54C9.4 249.8 0 267.8 0 288v17.6c0 8 6.4 14.4 14.4 14.4C46.2 320 72 294.2 72 262.4V256 224 184c0-24.3 12.1-45.8 30.5-58.9C98.3 135.9 96 147.7 96 160v64zM560 336a16 16 0 1 1 32 0 16 16 0 1 1 -32 0zM166.6 166.6c-4.2-4.2-6.6-10-6.6-16c0-12.5 10.1-22.6 22.6-22.6H361.4c12.5 0 22.6 10.1 22.6 22.6c0 6-2.4 11.8-6.6 16l-23.4 23.4C332.2 211.8 302.7 224 272 224s-60.2-12.2-81.9-33.9l-23.4-23.4z" />
    </g>
  ),
  /* El cerdo es el opuesto de la vaca: SIN cuello, cabeza pegada al cuerpo,
     patas cortas y cuerpo de barril. Si se le dibuja cuello parece un perro. */
  cerdo: (
    <g>
      <g className="ca-lejos">
        <path d="M48 64h9v20q0 4-4.5 4t-4.5-4z" />
        <path d="M84 64h9v20q0 4-4.5 4t-4.5-4z" />
      </g>
      {/* cola de tirabuzón: fina y pequeña. Con trazo grueso se leía como una
          segunda cabeza asomando por la grupa. */}
      <path d="M101 38q7-3 9 2t-2 7q-3 1-4-1t1-3l1 2q1 0 1-1 0-2-2-2t-3 1z" />
      {/* patas del lado de acá */}
      <path d="M40 64h9v20q0 4-4.5 4t-4.5-4zM76 64h9v20q0 4-4.5 4t-4.5-4z" />
      {/* cuerpo de barril */}
      <ellipse cx="66" cy="48" rx="37" ry="22" />
      {/* cabeza: se solapa con el cuerpo a propósito. El cerdo no tiene cuello
          visible, y dibujárselo lo convierte en un perro. */}
      <ellipse cx="27" cy="53" rx="17" ry="16" />
      {/* hocico, saliendo de la cabeza */}
      <ellipse cx="10" cy="56" rx="7" ry="6.5" />
      <circle className="ca-hueco" cx="8" cy="53.5" r="1.6" />
      <circle className="ca-hueco" cx="8" cy="58.5" r="1.6" />
      {/* oreja caída hacia delante */}
      <path d="M25 38q11-5 16 3l-14 8z" />
    </g>
  ),
  /* Mira a la IZQUIERDA, como la res y el cerdo: con el pico y la cola del
     mismo lado el ave no se lee — fue el primer intento y parecía un bulto. */
  pollo: (
    <g>
      {/* cola de plumas, saliendo por detrás del cuerpo */}
      <path d="M84 50q7-18 22-25-4 9 0 17 7-3 12 1-7 8-17 12-9 4-17 2z" />
      {/* cuerpo, la masa dominante del ave */}
      <ellipse cx="62" cy="58" rx="32" ry="26" />
      {/* cuello corto y grueso, hacia arriba y a la izquierda */}
      <path d="M28 30 46 27l8 24-24 4z" />
      {/* cabeza */}
      <circle cx="34" cy="27" r="12" />
      {/* cresta: tres crestas de tamaño decreciente hacia atrás */}
      <path d="M24 16q1-7 6-4 1-7 7-3 2-6 6-1 2 5-4 8-9 4-15 0z" />
      {/* pico */}
      <path d="M23 22 6 27l17 7z" />
      {/* barbilla */}
      <path d="M27 38q7 0 7 6-6 3-9-2z" />
      {/* patas y dedos */}
      <path d="M52 82h5v9h-5zM70 82h5v9h-5z" />
      <path d="M45 90h13q2 0 2 2t-2 2H45q-2 0-2-2t2-2zM63 90h13q2 0 2 2t-2 2H63q-2 0-2-2t2-2z" />
    </g>
  ),
};

export default function CortesAnimal() {
  const [especieId, setEspecieId] = useState('res');
  const [pais, setPais] = useState('Mexico');
  const [tocado, setTocado] = useState(null);

  const paises = useMemo(() => paisesConConsumo(), []);
  const especie = especieCanal(especieId);

  /* Los kilos de ESA carne en ESE país. Es lo único que cambia con el país; el
     reparto de la canal es el mismo en todas partes. */
  const kgEspecie = useMemo(() => {
    const d = consumoPersonaDe(pais);
    return d?.filas.find((f) => f.clave === especie.clave)?.kg ?? null;
  }, [pais, especie.clave]);

  const cortes = useMemo(() => cortesDe(especieId, kgEspecie), [especieId, kgEspecie]);
  const despojos = useMemo(() => despojosDe(pais), [pais]);

  const nombrePais = pais === 'MUNDO' ? 'el mundo' : nombreEs(pais);

  return (
    <section className="ca-canal" aria-labelledby="ca-canal-t">
      <header className="ca-canal-head">
        <div>
          <span className="ca-canal-kicker">
            <i className="fas fa-drumstick-bite" aria-hidden="true" /> Despiece
          </span>
          <h3 id="ca-canal-t">De qué parte del animal</h3>
          <p>
            El peso de una canal no se reparte por igual: unos cortes son dos veces
            otros. Elige el animal para ver qué parte pesa más, y el país para ver
            cuántos kilos de cada corte le tocan al año a una persona.
          </p>
        </div>

        <label className="ca-canal-pais mkt-pais-sel">
          <span>País</span>
          <select value={pais} onChange={(e) => setPais(e.target.value)}>
            <option value="MUNDO">Mundo (media)</option>
            {paises.map((p) => (
              <option key={p.ne} value={p.ne}>{p.nombre}</option>
            ))}
          </select>
        </label>
      </header>

      {/* Los tres animales. Botones y no un desplegable: son tres, y el cambio
          entre ellos es la gracia del bloque — esconderlo tras un menú lo
          convierte en algo que hay que descubrir. */}
      <div className="ca-especies" role="group" aria-label="Animal">
        {ESPECIES_CANAL.map((e) => (
          <button
            key={e.id}
            type="button"
            className={e.id === especieId ? 'is-activo' : undefined}
            aria-pressed={e.id === especieId}
            onClick={() => { setEspecieId(e.id); setTocado(null); }}
          >
            <i className={`fas ${e.icono}`} aria-hidden="true" />
            {e.nombre}
          </button>
        ))}
      </div>

      <div className="ca-canal-cuerpo">
        <figure className="ca-silueta">
          <svg viewBox="0 0 120 98" role="img" aria-label={`Silueta de ${especie.articulo}`}>
            {SILUETAS[especieId]}
          </svg>
          <figcaption>
            {kgEspecie > 0 ? (
              <>
                <strong>{fmt(kgEspecie, 1)}<em>kg</em></strong>
                <span>de {especie.nombre.toLowerCase()} al año por persona en {nombrePais}</span>
              </>
            ) : (
              <span className="ca-canal-sindato">
                La FAO no publica consumo de {especie.nombre.toLowerCase()} para {nombrePais}.
              </span>
            )}
          </figcaption>
        </figure>

        {/* Las barras. Una sola tinta: la longitud ya codifica el tamaño, y un
            degradado por valor gastaría el color repitiéndolo. */}
        <ol className="ca-cortes">
          {cortes.map((c) => (
            <li
              key={c.nombre}
              className={tocado && tocado !== c.nombre ? 'es-apagado' : undefined}
              onMouseEnter={() => setTocado(c.nombre)}
              onMouseLeave={() => setTocado(null)}
            >
              <div className="ca-corte-lbl">
                <b>{c.nombre}</b>
                <i>{c.usos}</i>
              </div>
              <div className="ca-corte-barra" aria-hidden="true">
                <span style={{ width: `${c.pct}%` }} />
              </div>
              <div className="ca-corte-cifras">
                <strong>{c.pct}<em>%</em></strong>
                {c.kg != null && <span>{fmt(c.kg, 1)} kg</span>}
              </div>
            </li>
          ))}
        </ol>
      </div>

      <p className="ca-canal-nota">
        <i className="fas fa-circle-info" aria-hidden="true" />
        {especie.nota}
      </p>

      {/* ── El dato que SÍ varía por país ──────────────────────────────────
          Existe para que el bloque no se quede en un reparto igual en todas
          partes: esto es lo único medido sobre qué partes del animal se comen
          de verdad en cada sitio, y la diferencia entre países es enorme. */}
      {despojos && (
        <div className="ca-despojos">
          <h4>
            Lo que sí cambia de país a país
            <em>Vísceras y grasa, kg por persona y año · {ANIO}</em>
          </h4>
          <ul>
            {despojos.filas.map((f) => (
              <li key={f.clave}>
                <span>{f.nombre}</span>
                {/* Escala fija sobre el máximo mundial, no sobre el país: con
                    una escala local, Mongolia y Japón se verían igual de
                    llenos y la comparación diría lo contrario de lo que hay. */}
                <div className="ca-desp-barra" aria-hidden="true">
                  <span style={{ width: `${Math.min((f.kg / despojos.tope) * 100, 100)}%` }} />
                </div>
                <strong>{fmt(f.kg, 1)}<em>kg</em></strong>
                {f.veces != null && (
                  <b className={f.veces >= 1 ? 'es-alto' : 'es-bajo'}>
                    {f.veces >= 1 ? `${fmt(f.veces, 1)}×` : `${fmt(f.veces, 2)}×`} la media
                  </b>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="ca-canal-pie">
        <i className="fas fa-triangle-exclamation" aria-hidden="true" />
        <span>
          <b>El reparto en porcentaje es el mismo para todos los países.</b> Es el
          rendimiento técnico del despiece —anatomía y sala de corte—, no una
          preferencia nacional: no existe publicado el consumo por corte y por
          país, ni en la FAO ni en el USDA, y no se inventa uno. Los porcentajes
          van redondeados porque el rendimiento real varía con la raza, el peso
          de sacrificio y el propio despiece. Lo que sí es de cada país son los
          kilos, que salen del consumo por habitante de {FUENTE} en {ANIO}, y el
          bloque de vísceras y grasa, que es dato medido.
        </span>
      </p>
    </section>
  );
}

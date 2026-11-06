export function reportDialogDate(value,t) {
  const date=new Date(value);
  return Number.isNaN(date.getTime()) ? t('Corte disponible') : date.toLocaleString(t.locale,{dateStyle:'medium',timeStyle:'short',timeZone:'America/Mexico_City'});
}

const errorMessages={
  REPORT_EMAIL_NOT_CONFIGURED:'El envío por correo aún no está configurado en el servidor.',
  REPORT_EMAIL_AUTH_FAILED:'El servidor de correo rechazó las credenciales del remitente. Contacta al administrador.',
  REPORT_EMAIL_UNAVAILABLE:'No se pudo conectar con el servidor de correo. Vuelve a intentarlo.',
  REPORT_EMAIL_DELIVERY_FAILED:'No se pudo entregar el correo. Inténtalo de nuevo más tarde.',
  REPORT_SCHEDULE_STORAGE_UNAVAILABLE:'No se pudo acceder al almacenamiento de las programaciones. Reintenta cuando se restablezca la base de datos.',
  REPORT_ACCOUNT_CHANGED:'La sesión cambió de cuenta. Recarga la cuenta para continuar.',
  REPORT_LANGUAGE_MISMATCH:'El idioma no coincide con el seleccionado. Vuelve a generar el informe.',
  REPORT_TRANSLATION_UNAVAILABLE:'La traducción no está disponible. Conservamos el informe original; vuelve a intentarlo.',
  REPORT_TRANSLATION_INVALID:'No se pudo completar la traducción del informe. Conservamos el original; vuelve a intentarlo.',
  REPORT_TRANSLATION_TIMEOUT:'La traducción tardó demasiado. Puedes volver a intentarlo.',
  REPORT_TRANSLATION_BUSY:'La traducción está ocupada. Espera unos segundos y vuelve a intentarlo.',
  REPORT_EMAIL_RATE_LIMIT:'Alcanzaste el límite de envíos por correo. Espera antes de volver a intentarlo.',
  REPORT_RATE_LIMIT:'Hay demasiadas solicitudes. Espera unos minutos y vuelve a intentarlo.',
};

export function reportDialogMessage(t,message,code,fallback='No se pudo completar esta operación. Vuelve a intentarlo.') {
  if(!message) return '';
  if(t.language==='es' || t.has(message)) return t(message);
  return t(errorMessages[code] || fallback);
}

export function reportDeliveryDescription(delivery,t) {
  if(!delivery?.enabled) return t('No recibirás envíos automáticos de este informe.');
  if(delivery.frequency==='twice_daily') return t('Se prepara una edición nueva al terminar cada corte: 06:00 y 14:00.');
  const frequency=t({daily:'Todos los días',weekdays:'De lunes a viernes',weekly:'Una vez por semana'}[delivery.frequency] || 'Todos los días');
  const day=delivery.frequency==='weekly' ? ` · ${t(['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'][Number(delivery.weekday)] || 'Lunes')}` : '';
  return t('{frequency}{day} a las {time} (hora de Ciudad de México).',{frequency,day,time:delivery.time});
}

export function reportDeliveryFeedback(feedback,t) {
  if(feedback.messageKey) return t(feedback.messageKey,{...feedback.parameters,...(feedback.nextRunAt ? {date:reportDialogDate(feedback.nextRunAt,t)} : {})});
  return reportDialogMessage(t,feedback.message,feedback.code);
}

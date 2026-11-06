// Preview translation and email delivery are separate operations. The email
// endpoint validates and translates the document before contacting SMTP.
export function reportEmailState(p) {
  if(p.sendingEmail) return {code:'sending',disabled:true,spinning:true};
  if(p.schedulingEmail || p.pdfPreviewLoading || p.downloadingPdf || p.downloadingData) return {code:'busy',disabled:true};
  if(!p.accountEmail || p.sessionChanged) return {code:'session',disabled:true};
  if(!p.active) return {code:'report',disabled:true};
  if(!p.recipientValid) return {code:'recipient',disabled:true};
  if(p.mailStatusLoading) return {code:'checking',disabled:true,spinning:true};
  if(p.mailStatus?.configured===false) return {code:'configuration',disabled:true};
  if(p.localizingReport || p.aiEditorProps?.pending || p.aiEditorProps?.generating) return {code:'preparing',disabled:true,spinning:true};
  if(p.localizationError) return {code:'preview_failed',disabled:false};
  return {code:'ready',disabled:false};
}

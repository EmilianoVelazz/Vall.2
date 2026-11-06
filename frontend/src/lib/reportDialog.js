export function keepDialogFocus(event) {
  if(event.key!=='Tab') return;
  const dialog=event.currentTarget;
  const controls=[...dialog.querySelectorAll('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, [tabindex]:not([tabindex="-1"])')].filter(element=>element.getClientRects().length && !element.closest('[inert]'));
  const first=controls[0],last=controls.at(-1),active=document.activeElement;
  if(!first) {event.preventDefault();dialog.focus();return;}
  if(event.shiftKey && active===first || !event.shiftKey && active===last || !dialog.contains(active)) {
    event.preventDefault();(event.shiftKey ? last : first).focus();
  }
}

export function restoreDialogFocus(previous) {
  const target=previous?.isConnected && !previous.matches(':disabled') ? previous : document.querySelector('.erh-collection-toolbar [role="tab"][aria-selected="true"]');
  target?.focus?.({preventScroll:true});
}

export function isDialogBackdropClick(event) {
  if(event.target!==event.currentTarget) return false;
  const box=event.currentTarget.getBoundingClientRect();
  return event.clientX<box.left || event.clientX>box.right || event.clientY<box.top || event.clientY>box.bottom;
}

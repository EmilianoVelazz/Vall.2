import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import * as seo from '../../../shared/site-seo.mjs';
export default function SiteMetadata(){const {pathname}=useLocation();useEffect(()=>{
  const route=pathname==='/'?'/':pathname.replace(/\/+$/,'');
  document.querySelectorAll('[data-vall-seo]').forEach(e=>e.remove());
  const template=document.createElement('template');template.innerHTML=seo.headMarkup(route);
  for(const node of template.content.children)node.setAttribute('data-vall-seo','');
  document.head.querySelectorAll('title').forEach(e=>e.remove());document.head.append(template.content);
  const privateFonts=document.querySelector('link[data-vall-private-fonts]');
  if(seo.site.privateRoutes[route] && route!=='/login'){
    if(!privateFonts){const link=document.createElement('link');link.rel='stylesheet';link.dataset.vallPrivateFonts='';link.href='https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;0,700;1,400&family=JetBrains+Mono:wght@600;700&family=Poppins:wght@600;700&display=swap';document.head.append(link);}
  }else privateFonts?.remove();
},[pathname]);return null;}

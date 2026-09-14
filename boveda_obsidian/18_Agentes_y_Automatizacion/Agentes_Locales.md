---
tags: [agentes, automatizacion, claude, ia]
---
# 🤖 Agentes Locales de Apoyo (Para Claude Code)

El proyecto cuenta con un ecosistema de **Agentes Especializados Locales**. Estos son archivos de contexto hiper-optimizados ubicados en la carpeta `.agents/` de la raíz del proyecto.

Sirven para darle a **Claude Code** (o cualquier CLI de IA) directivas estrictas de comportamiento para generar código de nivel Senior, evitando alucinaciones y **ahorrando drásticamente el consumo de tokens** (dinero).

## 👥 Agentes Disponibles

### 1. 🎨 UX/UI Agent (`UX_UI_Agent.md`)
- **Especialidad:** Diseño Frontend, Accesibilidad (a11y), consistencia visual.
- **Comando de uso:** `claude "Mejora el diseño del navbar usando .agents/UX_UI_Agent.md"`

### 2. ⚙️ Backend & API Agent (`Backend_API_Agent.md`)
- **Especialidad:** Clean Architecture, prevención de N+1 queries, seguridad, optimización.
- **Comando de uso:** `claude "Refactoriza este endpoint guiándote por .agents/Backend_API_Agent.md"`

### 3. 🚀 Performance & SEO Agent (`Performance_SEO_Agent.md`)
- **Especialidad:** Core Web Vitals (LCP, CLS), Lazy Loading, Semántica de búsqueda.
- **Comando de uso:** `claude "Optimiza la carga inicial según .agents/Performance_SEO_Agent.md"`

---

## ⚡ Beneficios del Ecosistema
1. **Cero Alucinaciones:** Los agentes le prohíben a la IA inventar clases o arquitecturas inexistentes.
2. **Strict Mode de Tokens:** Tienen órdenes absolutas de NO devolver archivos completos ni explicaciones largas, limitando las respuestas estrictamente al `diff` del código necesario.
3. **Roles Definidos:** Obligan a la IA a asumir una postura experta antes de escribir una sola línea.

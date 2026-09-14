---
tags: [backend, bd, arquitectura]
---
# Réplicas de Lectura/Escritura

Separar el tráfico de escritura (transaccional) del de lectura masiva (reportes/IA). Vital para escalar y para extraer datos pesados hacia el [[RAG_Base_Conocimiento]] sin tirar producción.
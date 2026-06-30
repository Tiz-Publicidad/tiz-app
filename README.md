# TIZ — Gestión Operativa V6 estable

Versión corregida para probar alertas, checklist, historial, tareas automáticas y respaldo Drive/Sheets.

## Flujo clave
Al pasar una obra o presupuesto a **Aprobado**, la app llama Apps Script por JSONP y crea en Drive:

- Carpeta OT dentro de `Producción / OT 2026`.
- Subcarpetas: Archivos Cliente, Diseño, Compras, Producción, Colocaciones, Fotos finales, Facturación.
- Google Sheet de respaldo con:
  - Orden de Trabajo
  - Datos obra
  - Items cotizados
  - Calculos auxiliares
  - Notas por sector
  - Datos Facturacion

## Para producción
Producción abre la carpeta de la OT y ve el Sheet de respaldo. Ahí puede revisar qué cotizó Ventas, qué cálculos auxiliares usó y qué quedó fuera del presupuesto final.

## Para facturación
La hoja `Datos Facturacion` concentra los datos que salen de la cotización y de la OT. Además, desde el formulario se puede descargar un CSV con el botón **Datos factura**.


## Versión V7.1 — ERP + Clemen IA

Esta versión agrega un panel inicial de IA operativa para anticipar problemas: obras aprobadas sin carpeta, vencimientos, facturación pendiente, cobranzas vencidas, ítems faltantes y compras probables. También mantiene el módulo de Facturación separado de las carpetas OT y el respaldo de cálculos auxiliares para Producción.

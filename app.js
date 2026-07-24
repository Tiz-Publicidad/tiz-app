# ERP TIZ V7.1 — IA, cálculos auxiliares y facturación

## Cálculos auxiliares para Producción
Cuando una obra se aprueba, Apps Script crea un Google Sheet dentro de la carpeta de la OT. Ese archivo incluye una hoja llamada **Calculos auxiliares**. Ahí queda lo que Ventas consideró para cotizar aunque no aparezca en el presupuesto final: materiales, horas, fletes, terceros, observaciones y totales.

Producción debe abrir la carpeta Drive de la OT y revisar el Sheet de respaldo antes de fabricar. Esto evita que Producción trabaje sin saber qué alcance consideró Ventas.

## Facturación
Las facturas se manejan como módulo separado dentro del ERP. La pantalla Facturación resume: tipo de comprobante, cliente, CUIT, OT, neto, IVA, total, CAE, estado y vencimiento.

Por ahora la app prepara los datos y permite exportar CSV. La integración directa con ARCA se deja para la siguiente etapa, cuando estén configurados el certificado digital, clave privada y punto de venta Web Service.

## Clemen IA
La pantalla Clemen IA anticipa problemas usando reglas internas sobre los datos del ERP. No inventa información: marca faltantes, vencimientos, riesgo de margen, facturación pendiente y compras probables.

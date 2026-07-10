require('dotenv').config();
const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.json());

// 1. Ruta de prueba visual (Para abrir desde el navegador)
app.get('/', (req, res) => {
    res.send('✅ ¡El servidor de ComandUp está en línea y conectado a internet!');
});

// 2. Ruta de alertas (La que usará Dolibarr)
app.post('/webhook/alertas', async (req, res) => {
    const datos = req.body;
    console.log("📥 ¡Evento detectado por ComandUp! Código:", datos.triggercode);

    // Solo reaccionamos cuando se valida un documento en la caja
    if (datos.triggercode === 'BILL_VALIDATE') {
        const factura = datos.object;
        let mensajeWhatsApp = '';
        let enviarAlerta = false;

        // 1. Detectar Notas de Crédito (Cancelaciones en TakePOS)
        // En Dolibarr, el type '2' significa que es una nota de crédito / devolución
        if (factura.type === '2') {
            mensajeWhatsApp = `🚨 *ALERTA COMANDUP: CANCELACIÓN* 🚨\nSe ha generado una Nota de Crédito en el sistema.\nTicket ref: ${factura.ref}\nMonto devuelto: $${factura.total_ttc}`;
            enviarAlerta = true;
        }
        // 2. Detectar Descuentos sospechosos (Ej. mayores o iguales al 15%)
        else if (factura.remise_percent && parseFloat(factura.remise_percent) >= 15) {
            mensajeWhatsApp = `⚠️ *ALERTA COMANDUP: DESCUENTO ALTO* ⚠️\nSe aplicó un descuento del ${factura.remise_percent}% a una cuenta.\nTicket ref: ${factura.ref}\nTotal cobrado: $${factura.total_ttc}`;
            enviarAlerta = true;
        }

        // Si se cumplió alguna de las reglas, disparamos el WhatsApp
        if (enviarAlerta) {
            try {
                // Usamos tu URL con el prefijo 7107 que ya confirmamos que funciona
                const urlGreenAPI = `https://7107.api.greenapi.com/waInstance${process.env.ID_INSTANCE}/sendMessage/${process.env.API_TOKEN_INSTANCE}`;
                
                const payload = {
                    chatId: process.env.PHONE_GERENTE,
                    message: mensajeWhatsApp
                };

                await axios.post(urlGreenAPI, payload);
                console.log("✅ Alerta de seguridad enviada al WhatsApp del gerente.");

            } catch (error) {
                console.error("❌ Error al enviar WhatsApp:", error.message);
            }
        } else {
            // Si es una venta normal, el servidor se queda en silencio
            console.log("✅ Venta normal registrada. No requiere alerta.");
        }
    }

    // Siempre respondemos un 200 para que Dolibarr sepa que lo recibimos bien
    res.status(200).send("Webhook procesado con éxito");
});

// 3. Encendido con host 0.0.0.0 estricto
const PUERTO = process.env.PORT || 8080;
app.listen(PUERTO, '0.0.0.0', () => {
    console.log(`🚀 Servidor en puerto ${PUERTO}`);
});
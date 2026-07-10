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

    if (datos.triggercode === 'BILL_VALIDATE') {
        const factura = datos.object;
        let mensajeWhatsApp = '';
        let enviarAlerta = false;

        // 🔍 LUPA DE DEBUGGING: Vamos a espiar exactamente qué nos manda Dolibarr
        console.log("🔍 TIPO DE DOC RECIBIDO:", factura.type);
        console.log("🔍 DESCUENTO RECIBIDO:", factura.remise_percent);

        // Usamos == (doble igual) para que acepte tanto el número 2 como el texto '2'
        if (factura.type == 2) {
            mensajeWhatsApp = `🚨 *ALERTA COMANDUP: CANCELACIÓN* 🚨\nSe ha generado una Nota de Crédito en el sistema.\nTicket ref: ${factura.ref}\nMonto devuelto: $${factura.total_ttc}`;
            enviarAlerta = true;
        }
        else if (factura.remise_percent && parseFloat(factura.remise_percent) >= 15) {
            mensajeWhatsApp = `⚠️ *ALERTA COMANDUP: DESCUENTO ALTO* ⚠️\nSe aplicó un descuento del ${factura.remise_percent}% a una cuenta.\nTicket ref: ${factura.ref}\nTotal cobrado: $${factura.total_ttc}`;
            enviarAlerta = true;
        }

        if (enviarAlerta) {
            try {
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
            console.log("✅ Venta normal registrada. No requiere alerta.");
        }
    }

    res.status(200).send("Webhook procesado con éxito");
});

// 3. Encendido con host 0.0.0.0 estricto
const PUERTO = process.env.PORT || 8080;
app.listen(PUERTO, '0.0.0.0', () => {
    console.log(`🚀 Servidor en puerto ${PUERTO}`);
});
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

    // ==========================================
    // 1. REGLAS PARA FACTURAS Y COBROS
    // ==========================================
    if (datos.triggercode === 'BILL_VALIDATE') {
        const factura = datos.object;
        let mensajeWhatsApp = '';
        let enviarAlerta = false;

        console.log("🔍 TIPO DE DOC RECIBIDO:", factura.type);
        console.log("🔍 DESCUENTO RECIBIDO:", factura.remise_percent);

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
                await axios.post(urlGreenAPI, { chatId: process.env.PHONE_GERENTE, message: mensajeWhatsApp });
                console.log("✅ Alerta de caja enviada.");
            } catch (error) {
                console.error("❌ Error al enviar WhatsApp:", error.message);
            }
        } else {
            console.log("✅ Venta normal registrada. No requiere alerta.");
        }
    } 
    // ==========================================
    // 2. REGLAS PARA INVENTARIO ("86")
    // ==========================================
    else if (datos.triggercode === 'PRODUCT_MODIFY') {
        const producto = datos.object;
        
        // En Dolibarr, el status '0' significa que ya no está a la venta
        console.log(`🔍 Revisando producto: ${producto.label} | Estado venta: ${producto.status}`);

        if (producto.status == 0) {
            const mensajeWhatsApp = `🛑 *ALERTA COMANDUP: PRODUCTO AGOTADO (86)* 🛑\nEl platillo *${producto.label}* ha sido marcado como FUERA DE VENTA.\nPor favor, informe a las mesas y no ofrezca este producto.`;
            
            try {
                const urlGreenAPI = `https://7107.api.greenapi.com/waInstance${process.env.ID_INSTANCE}/sendMessage/${process.env.API_TOKEN_INSTANCE}`;
                await axios.post(urlGreenAPI, { chatId: process.env.PHONE_GERENTE, message: mensajeWhatsApp });
                console.log("✅ Alerta 86 enviada exitosamente.");
            } catch (error) {
                console.error("❌ Error al enviar WhatsApp:", error.message);
            }
        } else {
            console.log("✅ Modificación de producto normal (Sigue en venta).");
        }
    }

    res.status(200).send("Webhook procesado con éxito");
});

// 3. Encendido con host 0.0.0.0 estricto
const PUERTO = process.env.PORT || 8080;
app.listen(PUERTO, '0.0.0.0', () => {
    console.log(`🚀 Servidor en puerto ${PUERTO}`);
});
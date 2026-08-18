const express = require('express');
const axios = require('axios');
const cron = require('node-cron');
const cors = require('cors');
const mysql = require('mysql2/promise');

const app = express();

// ==========================================
// CONFIGURACIÓN INICIAL
// ==========================================
app.use(express.json());
app.use(cors()); // Permite que GitHub Pages hable con este servidor

// Conexión a la BD de Railway (Soporta formato con y sin guión bajo)
const dbPool = mysql.createPool({
    host: process.env.MYSQLHOST || process.env.MYSQL_HOST,
    user: process.env.MYSQLUSER || process.env.MYSQL_USER,
    password: process.env.MYSQLPASSWORD || process.env.MYSQL_PASSWORD,
    database: process.env.MYSQLDATABASE || process.env.MYSQL_DATABASE,
    port: process.env.MYSQLPORT || process.env.MYSQL_PORT
});

// ==========================================
// MEMORIA DEL TURNO (Alcancía virtual)
// ==========================================
let ventasDelDia = 0;
let ticketsAtendidos = 0;

// ==========================================
// 1. RUTAS DE LA APLICACIÓN WEB (SaaS)
// ==========================================

// --- RUTA DE LOGIN ---
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const [rows] = await dbPool.query('SELECT id, restaurante, rol, plan, fecha_vencimiento, estado FROM usuarios_saas WHERE email = ? AND password = ?', [email, password]);
        
        if (rows.length > 0) {
            res.json({ success: true, usuario: rows[0] });
        } else {
            res.status(401).json({ success: false, mensaje: 'Credenciales incorrectas' });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// --- RUTA DE REGISTRO (CHECKOUT) ---
app.post('/api/register', async (req, res) => {
    const { restaurante, email, password, plan } = req.body;
    
    // Calcula 1 año a partir de hoy
    const fechaInicio = new Date().toISOString().split('T')[0]; 
    const fechaVencObj = new Date();
    fechaVencObj.setFullYear(fechaVencObj.getFullYear() + 1);
    const fechaVencimiento = fechaVencObj.toISOString().split('T')[0]; 

    try {
        const [existentes] = await dbPool.query('SELECT id FROM usuarios_saas WHERE email = ?', [email]);
        if (existentes.length > 0) {
            return res.status(400).json({ success: false, mensaje: 'Este correo ya tiene una cuenta activa.' });
        }

        await dbPool.query(
            'INSERT INTO usuarios_saas (restaurante, email, password, rol, plan, fecha_inicio, fecha_vencimiento, estado) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [restaurante, email, password, 'cliente', plan, fechaInicio, fechaVencimiento, 'Activo']
        );
        
        res.json({ success: true, mensaje: 'Pago procesado y cuenta creada.' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// --- RUTA PARA VER CLIENTES (ADMIN) ---
app.get('/api/clientes', async (req, res) => {
    try {
        const [rows] = await dbPool.query('SELECT * FROM usuarios_saas WHERE rol = "cliente"');
        res.json({ success: true, clientes: rows });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ==========================================
// 2. OÍDO PARA DOLIBARR Y GREENAPI (Webhooks)
// ==========================================

app.post('/webhook/alertas', async (req, res) => {
    const datos = req.body;
    console.log("📥 ¡Evento detectado por ComandUp! Código:", datos.triggercode);

    if (datos.triggercode === 'BILL_VALIDATE') {
        const factura = datos.object;
        let mensajeWhatsApp = '';
        let enviarAlerta = false;

        if (factura.type == 2) {
            ventasDelDia -= parseFloat(factura.total_ttc);
            ticketsAtendidos -= 1;
            mensajeWhatsApp = `🚨 *ALERTA COMANDUP: CANCELACIÓN* 🚨\nSe generó una Nota de Crédito.\nTicket: ${factura.ref}\nMonto devuelto: $${factura.total_ttc}`;
            enviarAlerta = true;
        } else {
            ventasDelDia += parseFloat(factura.total_ttc);
            ticketsAtendidos += 1;
            if (factura.remise_percent && parseFloat(factura.remise_percent) >= 15) {
                mensajeWhatsApp = `⚠️ *ALERTA COMANDUP: DESCUENTO ALTO* ⚠️\nSe aplicó un descuento del ${factura.remise_percent}% a una cuenta.\nTicket: ${factura.ref}\nTotal: $${factura.total_ttc}`;
                enviarAlerta = true;
            }
        }

        if (enviarAlerta) {
            try {
                const url = `https://7107.api.greenapi.com/waInstance${process.env.ID_INSTANCE}/sendMessage/${process.env.API_TOKEN_INSTANCE}`;
                await axios.post(url, { chatId: process.env.PHONE_GERENTE, message: mensajeWhatsApp });
            } catch (error) { console.error("❌ Error enviando alerta:", error.message); }
        }
    } 
    else if (datos.triggercode === 'PRODUCT_MODIFY') {
        const producto = datos.object;
        const urlGreenAPI = `https://7107.api.greenapi.com/waInstance${process.env.ID_INSTANCE}/sendMessage/${process.env.API_TOKEN_INSTANCE}`;

        if (producto.status == 0) {
            const msjAgotado = `🛑 *ALERTA COMANDUP: PRODUCTO AGOTADO (86)* 🛑\nEl platillo *${producto.label}* está FUERA DE VENTA. No lo ofrezcan hasta nuevo aviso.`;
            try {
                await axios.post(urlGreenAPI, { chatId: process.env.PHONE_GERENTE, message: msjAgotado });
                if (process.env.GROUP_MESEROS) {
                    await axios.post(urlGreenAPI, { chatId: process.env.GROUP_MESEROS, message: msjAgotado });
                }
            } catch (error) { console.error("❌ Error enviando 86:", error.message); }
        } 
        else if (producto.status == 1) {
            const msjDisponible = `✅ *ALERTA COMANDUP: PRODUCTO DISPONIBLE* ✅\nEl platillo *${producto.label}* vuelve a estar a la venta. ¡Ya pueden ofrecerlo de nuevo!`;
            try {
                await axios.post(urlGreenAPI, { chatId: process.env.PHONE_GERENTE, message: msjDisponible });
                if (process.env.GROUP_MESEROS) {
                    await axios.post(urlGreenAPI, { chatId: process.env.GROUP_MESEROS, message: msjDisponible });
                }
            } catch (error) { console.error("❌ Error enviando alerta de disponibilidad:", error.message); }
        }
    }
    res.status(200).send("Webhook Dolibarr procesado");
});

app.post('/webhook/whatsapp', async (req, res) => {
    try {
        const webhookData = req.body;
        if (webhookData.typeWebhook === 'incomingMessageReceived' || webhookData.typeWebhook === 'outgoingMessageReceived') {
            const messageData = webhookData.messageData || {};
            let mensajeBruto = "";
            if (messageData.typeMessage === 'textMessage') {
                mensajeBruto = messageData.textMessageData?.textMessage;
            } else if (messageData.typeMessage === 'extendedTextMessage') {
                mensajeBruto = messageData.extendedTextMessageData?.text;
            }
            const mensaje = (mensajeBruto || "").trim().toLowerCase();
            const chatId = webhookData.senderData?.chatId;

            if (mensaje === '!reporte') {
                const msj = `📊 *REPORTE RÁPIDO COMANDUP*\n\n🧾 *Tickets:* ${ticketsAtendidos}\n💰 *Ventas:* $${ventasDelDia.toFixed(2)}`;
                const url = `https://7107.api.greenapi.com/waInstance${process.env.ID_INSTANCE}/sendMessage/${process.env.API_TOKEN_INSTANCE}`;
                await axios.post(url, { chatId: chatId, message: msj });
            }
        }
    } catch (error) { console.error("❌ Error en el Chatbot:", error.message); }
    res.status(200).send("Webhook GreenAPI procesado");
});

// ==========================================
// 3. CORTE DE CAJA AUTOMÁTICO (El Reloj)
// ==========================================
cron.schedule('0 22 * * *', async () => {
    const textoCierre = `🌙 *CIERRE DE TURNO COMANDUP* 🌙\n\nResumen de hoy:\n🧾 *Tickets:* ${ticketsAtendidos}\n💰 *Ingresos:* $${ventasDelDia.toFixed(2)}\n\n_La caja virtual ha sido reiniciada para mañana._`;
    try {
        const urlGreenAPI = `https://7107.api.greenapi.com/waInstance${process.env.ID_INSTANCE}/sendMessage/${process.env.API_TOKEN_INSTANCE}`;
        await axios.post(urlGreenAPI, { chatId: process.env.PHONE_GERENTE, message: textoCierre });
        ventasDelDia = 0;
        ticketsAtendidos = 0;
    } catch (error) { console.error("❌ Error automático:", error.message); }
}, { timezone: "America/Monterrey" });

// ENCENDIDO DEL SERVIDOR
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
    console.log(`🚀 Servidor ComandUp en línea (Puerto ${PORT})`);
});
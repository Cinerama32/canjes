const express = require('express');
const xlsx = require('xlsx');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const app = express();

// Inicializar Supabase
const supabase = createClient("https://cmljiyuewpikausfrgbj.supabase.co", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtbGppeXVld3Bpa2F1c2ZyZ2JqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mjk0NjUyNDUsImV4cCI6MjA0NTA0MTI0NX0.6FUMoKZZWcqikIJuzbIDK15u2T8Wdtl3zE1HTGbyNwI");

app.use(express.json());

// Sirve archivos estáticos (CSS, imágenes, etc.) desde la carpeta 'public'
app.use(express.static(path.join(__dirname, 'public')));

// Ruta raíz que sirve el archivo index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/search', async (req, res) => {
    const { searchTerm, searchType } = req.body;

    // Leer ambos archivos Excel
    const efectivoWorkbook = xlsx.readFile(path.join(__dirname, 'public', 'efectivo.xlsx'));
    const webWorkbook = xlsx.readFile(path.join(__dirname, 'public', 'web.xlsx'));

    // Convertir las hojas a JSON
    const efectivoData = xlsx.utils.sheet_to_json(efectivoWorkbook.Sheets[efectivoWorkbook.SheetNames[0]]);
    const webData = xlsx.utils.sheet_to_json(webWorkbook.Sheets[webWorkbook.SheetNames[0]]);

    let results = [];

    if (searchType === 'email') {
        results = [
            ...efectivoData.filter(row => row['E-mail Comprador']?.toLowerCase().includes(searchTerm.toLowerCase())),
            ...webData.filter(row => row['E-mail Comprador']?.toLowerCase().includes(searchTerm.toLowerCase()))
        ];
    } else if (searchType === 'codigo_venta') {
        // Buscar por Código de Venta con conversión a string si es necesario
        results = [
            ...efectivoData.filter(row => {
                const codigoVenta = String(row['Código de Venta'] || ''); // Convertir a cadena si es necesario
                return codigoVenta.toLowerCase().includes(searchTerm.toLowerCase());
            }),
            ...webData.filter(row => {
                const codigoVenta = String(row['Código de Venta'] || ''); // Convertir a cadena si es necesario
                return codigoVenta.toLowerCase().includes(searchTerm.toLowerCase());
            })
        ];
    } else {
        results = [
            ...efectivoData.filter(row => {
                const codigoVenta = String(row['Código de Venta'] || ''); // Convertir a cadena si es necesario
                return codigoVenta.toLowerCase().includes(searchTerm.toLowerCase());
            }),
            ...webData.filter(row => {
                const codigoVenta = String(row['Código de Venta'] || ''); // Convertir a cadena si es necesario
                return codigoVenta.toLowerCase().includes(searchTerm.toLowerCase());
            })
        ];
    }

    // Obtener los emails únicos de los resultados
    const emails = [...new Set(results.map(r => r['E-mail Comprador']))];

    // Consultar Supabase para ver cuáles ya fueron entregados
    const { data: deliveredData, error } = await supabase
        .from('canjes')
        .select('*')
        .in('email', emails);

    if (error) {
        console.error('Error al consultar Supabase:', error);
        return res.status(500).json({ error: 'Error al consultar la base de datos' });
    }

    // Crear un objeto para fácil acceso a los registros entregados
    const delivered = {};
    deliveredData.forEach(record => {
        delivered[record.email] = record;
    });

    res.json({
        results,
        delivered
    });
});



app.post('/deliver', async (req, res) => {
    const { email, nombre, apellido, cantidad, lugar, asistentes, fecha, monto,detalle,origen, codigo } = req.body;

    
    // Insertar en Supabase
    const { data, error } = await supabase
        .from('canjes')
        .insert([{
            email,
            nombre,
            apellido,
            cantidad,
            lugar,
            asistentes,
            fecha,
            monto,
            detalle,
            origen,
            codigo
        }])
        .select()
        .single();
  
    if (error) {
        console.error('Error al insertar en Supabase:', error);
        return res.status(500).json({ error: 'Error al registrar la entrega' });
    }

    res.json({
        success: true,
        entry: data
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

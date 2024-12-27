const express = require('express');
const xlsx = require('xlsx');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const app = express();

// Inicializar Supabase
const supabase = createClient("https://cmljiyuewpikausfrgbj.supabase.co", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtbGppeXVld3Bpa2F1c2ZyZ2JqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mjk0NjUyNDUsImV4cCI6MjA0NTA0MTI0NX0.6FUMoKZZWcqikIJuzbIDK15u2T8Wdtl3zE1HTGbyNwI");

app.use(express.json());
app.use(express.static('public'));

app.post('/search', async (req, res) => {
    const { searchTerm, searchType } = req.body;
    
    // Leer ambos archivos Excel
    const efectivoWorkbook = xlsx.readFile('efectivo.xlsx');
    const webWorkbook = xlsx.readFile('web.xlsx');
    
    // Convertir las hojas a JSON
    const efectivoData = xlsx.utils.sheet_to_json(efectivoWorkbook.Sheets[efectivoWorkbook.SheetNames[0]]);
    const webData = xlsx.utils.sheet_to_json(webWorkbook.Sheets[webWorkbook.SheetNames[0]]);
    
    let results = [];
    
    if (searchType === 'email') {
        results = [
            ...efectivoData.filter(row => row['E-mail Comprador']?.toLowerCase().includes(searchTerm.toLowerCase())),
            ...webData.filter(row => row['E-mail Comprador']?.toLowerCase().includes(searchTerm.toLowerCase()))
        ];
    } else {
        results = [
            ...efectivoData.filter(row => 
                (row['Nombre Comprador']?.toLowerCase() + ' ' + row['Apellido Comprador']?.toLowerCase())
                .includes(searchTerm.toLowerCase())
            ),
            ...webData.filter(row => 
                (row['Nombre Comprador']?.toLowerCase() + ' ' + row['Apellido Comprador']?.toLowerCase())
                .includes(searchTerm.toLowerCase())
            )
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
    const { email, nombre, apellido, cantidad, lugar, asistentes } = req.body;
    const fechaYHoraActual = new Date(); 

    // Formatear la fecha en español (sin coma y con el formato correcto)
    const fechaFormateada = fechaYHoraActual.toLocaleString('es-AR', {
        weekday: 'short', // Día de la semana (abreviado)
        year: 'numeric', // Año con 4 dígitos
        month: 'short',  // Mes abreviado
        day: 'numeric',  // Día del mes
        hour: '2-digit', // Hora con 2 dígitos
        minute: '2-digit', // Minutos con 2 dígitos
        second: '2-digit', // Segundos con 2 dígitos
        hour12: false // Usar formato de 24 horas
    }).replace(',', '');  // Eliminar la coma después del día
    
    console.log(fechaFormateada);
    
 

    // Insertar en Supabase
    const { data, error } = await supabase
        .from('canjes')
        .insert([
            {
                email,
                nombre,
                apellido,
                cantidad,
                lugar,
                asistentes,
                fecha: fechaFormateada
            }
        ])
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
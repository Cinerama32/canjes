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
    const { email, nombre, apellido, cantidad, lugar, asistentes, fecha, monto, detalle, origen, codigo } = req.body;


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

app.post('/totales', async (req, res) => {
    console.log('Iniciando cálculo de totales...');

    try {
        let allData = [];  // Para almacenar todos los datos
        let from = 0;      // Índice inicial
        let to = 999;      // Índice final de la primera página (1000 registros)
        let hasMoreData = true;  // Indicador para saber si hay más datos

        // Primero obtenemos el número total de registros
        const { count, error: countError } = await supabase
            .from('canjes')
            .select('id', { count: 'exact' });

        // Verificamos si hubo un error al contar las filas
        if (countError) {
            console.error('Error al contar las filas:', countError);
            return res.status(500).json({ error: 'Error al contar las filas en la tabla "canjes".' });
        }

        console.log(`Total de registros en la tabla: ${count}`);

        while (hasMoreData) {
            // Aseguramos que el rango no exceda el total de filas
            if (to >= count) {
                to = count - 1;  // Ajustamos el "to" al último índice disponible
                hasMoreData = false;  // Terminamos la paginación
            }

            // Consultar los datos en el rango actual (paginación)
            console.log(`Consultando registros del ${from + 1} al ${to + 1}...`);
            const { data, error } = await supabase
                .from('canjes')
                .select('lugar, cantidad')
                .range(from, to); // Rango de la página actual

            // Verificamos si hubo un error
            if (error) {
                console.error('Error al obtener los datos de Supabase:', error);
                return res.status(500).json({ error: 'Error al obtener los datos de Supabase' });
            }

            // Si no se obtienen datos, finalizamos la paginación
            if (!data || data.length === 0) {
                hasMoreData = false;
            } else {
                // Acumulamos los datos obtenidos
                allData = allData.concat(data);
                console.log(`Obtenidos ${data.length} registros. Total acumulado: ${allData.length}`);

                // Actualizamos los índices para la siguiente página
                from += 1000;
                to += 1000;
            }
        }

        // Verificar si se obtuvieron datos
        if (allData.length === 0) {
            console.log('No se encontraron datos en la tabla "canjes".');
            return res.json({});
        }

        console.log(`Datos obtenidos de Supabase: ${allData.length} registros`);

        // Inicializar un objeto para almacenar los totales por lugar
        const totalesPorLugar = {};

        // Recorrer los datos y acumular los totales por lugar
        allData.forEach((record, index) => {
            const lugar = record.lugar;
            const cantidad = parseInt(record.cantidad) || 0; // Asegurarse de que la cantidad sea un número

            // Verificamos el lugar y la cantidad antes de acumular
            console.log(`Procesando registro ${index + 1}: lugar = ${lugar}, cantidad = ${cantidad}`);

            // Si ya existe el lugar, sumamos la cantidad
            if (totalesPorLugar[lugar]) {
                totalesPorLugar[lugar] += cantidad;
            } else {
                totalesPorLugar[lugar] = cantidad;  // Si no existe, iniciamos con la cantidad
            }
        });

        console.log('Totales por lugar calculados:', totalesPorLugar);

        // Devolver los totales por lugar
        res.json(totalesPorLugar);
    } catch (error) {
        console.error('Error al calcular los totales:', error);
        res.status(500).json({ error: 'Error al calcular los totales' });
    }
});




async function contarFilas() {
    try {
        // Realizar la consulta para contar las filas en la tabla 'canjes'
        const { count, error } = await supabase
            .from('canjes')
            .select('id', { count: 'exact' });  // Usamos 'id' o cualquier columna única

        // Verificar si hubo un error
        if (error) {
            console.error('Error al contar las filas:', error);
            return;
        }

        // Mostrar el conteo en la consola
        console.log(`Cantidad de filas en la tabla 'canjes': ${count}`);
    } catch (error) {
        console.error('Error al contar las filas:', error);
    }
}

// Llamar a la función para contar las filas
contarFilas();

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

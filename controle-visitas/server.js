const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// URL do CSV do Google Sheets fornecida por ti
const SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTbFEV2SXq7MT1JC-PkwaUbT9YhIvcrrmqScQd-AH_qVwOgLZeKUW3l1cJ6XY3zvg1WCpoY50mBdDn3/pub?gid=0&single=true&output=csv';

// Conexão com o Banco de Dados SQLite
const db = new sqlite3.Database('./visitas.db', (err) => {
    if (err) console.error('Erro ao conectar ao SQLite:', err.message);
    else console.log('Conectado ao banco de dados SQLite.');
});

// Criar tabela de visitas com os campos de paciente, leito e setor
db.run(`
    CREATE TABLE IF NOT EXISTS visitas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tipo_controle TEXT,
        nome_completo TEXT,
        parentesco TEXT,
        documento TEXT,
        contato TEXT,
        paciente_nome TEXT,
        paciente_leito TEXT,
        paciente_setor TEXT,
        data_entrada TEXT,
        hora_entrada TEXT,
        data_saida TEXT,
        hora_saida TEXT,
        status TEXT DEFAULT 'ABERTO'
    )
`);

// Função robusta para converter o CSV do Google Sheets em array de objetos JSON
function parseCSV(csvText) {
    const lines = csvText.split(/\r?\n/);
    if (lines.length < 2) return [];
    
    // Deteta automaticamente o separador (vírgula ou ponto e vírgula)
    const separator = lines[0].includes(';') ? ';' : ',';
    
    const results = [];
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        // Divide a linha respeitando eventuais aspas do CSV
        const row = line.split(separator).map(cell => cell.replace(/^"(.*)"$/, '$1').trim());
        
        if (row.length >= 3 && row[0]) {
            results.push({
                nome: row[0],
                leito: row[1] || 'N/A',
                setor: row[2] || 'N/A'
            });
        }
    }
    return results;
}

// Rota para buscar a lista de pacientes diretamente do Google Sheets
app.get('/api/pacientes', (req, res) => {
    https.get(SHEET_CSV_URL, (response) => {
        let data = '';
        response.on('data', chunk => data += chunk);
        response.on('end', () => {
            try {
                const pacientes = parseCSV(data);
                res.json(pacientes);
            } catch (error) {
                res.status(500).json({ error: 'Erro ao processar dados do Google Sheets' });
            }
        });
    }).on('error', (err) => {
        res.status(500).json({ error: 'Erro ao conectar ao Google Sheets' });
    });
});

// Rota para registrar uma nova entrada
app.post('/api/visitas', (req, res) => {
    const { 
        tipo_controle, nome_completo, parentesco, documento, 
        contato, paciente_nome, paciente_leito, paciente_setor, 
        data_entrada, hora_entrada 
    } = req.body;

    const sql = `
        INSERT INTO visitas 
        (tipo_controle, nome_completo, parentesco, documento, contato, paciente_nome, paciente_leito, paciente_setor, data_entrada, hora_entrada)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    db.run(sql, [tipo_controle, nome_completo, parentesco, documento, contato, paciente_nome, paciente_leito, paciente_setor, data_entrada, hora_entrada], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: this.lastID, status: 'Sucesso' });
    });
});

// Rota para listar histórico
app.get('/api/visitas', (req, res) => {
    db.all("SELECT * FROM visitas ORDER BY id DESC", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// Rota para registrar saída
app.put('/api/visitas/:id/saida', (req, res) => {
    const { id } = req.params;
    const { data_saida, hora_saida } = req.body;
    
    const sql = `UPDATE visitas SET data_saida = ?, hora_saida = ?, status = 'FECHADO' WHERE id = ?`;
    db.run(sql, [data_saida, hora_saida, id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ status: 'Saída registrada com sucesso' });
    });
});

app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});

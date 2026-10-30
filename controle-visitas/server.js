const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// URL do CSV do Google Sheets
const SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTbFEV2SXq7MT1JC-PkwaUbT9YhIvcrrmqScQd-AH_qVwOgLZeKUW3l1cJ6XY3zvg1WCpoY50mBdDn3/pub?gid=0&single=true&output=csv';

// Conexão com o Banco de Dados SQLite
const db = new sqlite3.Database('./visitas.db', (err) => {
    if (err) {
        console.error('Erro ao conectar ao SQLite:', err.message);
    } else {
        console.log('Conectado ao banco de dados SQLite.');
        inicializarBancoDeDados();
    }
});

function inicializarBancoDeDados() {
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
            possui_excecao TEXT,
            motivo_excecao TEXT,
            data_entrada TEXT,
            hora_entrada TEXT,
            data_saida TEXT,
            hora_saida TEXT,
            status TEXT DEFAULT 'ABERTO'
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS usuarios (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            usuario TEXT UNIQUE,
            senha TEXT
        )
    `, () => {
        db.get("SELECT COUNT(*) as total FROM usuarios", (err, row) => {
            if (row && row.total === 0) {
                db.run("INSERT INTO usuarios (usuario, senha) VALUES (?, ?)", ['recepcao', 'hospital123'], (err) => {
                    if (!err) console.log('Utilizador padrão criado no SQLite: recepcao / hospital123');
                });
            }
        });
    });
}

function parseCSV(csvText) {
    const cleanText = csvText.replace(/^\uFEFF/, '');
    const lines = cleanText.split(/\r?\n/);
    if (lines.length < 2) return [];

    const separator = lines[0].includes(';') ? ';' : ',';
    const results = [];

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const row = line.split(separator).map(cell => cell.replace(/^"(.*)"$/, '$1').trim());

        const nome = row[0] ? row[0].trim() : '';
        const leito = row[1] && row[1].trim() !== '' ? row[1].trim() : 'S/L';
        const setor = row[2] && row[2].trim() !== '' ? row[2].trim() : 'Geral';

        if (nome && !nome.toLowerCase().includes('nome do paciente')) {
            results.push({
                nome: nome,
                leito: leito,
                setor: setor
            });
        }
    }
    return results;
}

// Rota de login
app.post('/api/login', (req, res) => {
    const { usuario, senha } = req.body;
    const sql = `SELECT * FROM usuarios WHERE usuario = ? AND senha = ?`;
    db.get(sql, [usuario, senha], (err, row) => {
        if (err) return res.status(500).json({ sucesso: false, mensagem: 'Erro interno' });
        if (row) {
            res.json({ sucesso: true, mensagem: 'Login autorizado' });
        } else {
            res.status(401).json({ sucesso: false, mensagem: 'Utilizador ou senha incorretos' });
        }
    });
});

// Rota para listar utilizadores
app.get('/api/usuarios', (req, res) => {
    db.all("SELECT id, usuario FROM usuarios ORDER BY id DESC", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// Rota para registar novo utilizador
app.post('/api/usuarios', (req, res) => {
    const { usuario, senha } = req.body;
    if (!usuario || !senha) {
        return res.status(400).json({ error: 'Preencha todos os campos' });
    }

    const sql = `INSERT INTO usuarios (usuario, senha) VALUES (?, ?)`;
    db.run(sql, [usuario, senha], function(err) {
        if (err) {
            return res.status(400).json({ error: 'Este nome de utilizador já existe.' });
        }
        res.json({ id: this.lastID, sucesso: true });
    });
});

app.get('/api/pacientes', async (req, res) => {
    try {
        const response = await fetch(SHEET_CSV_URL);
        if (!response.ok) return res.status(500).json({ error: 'Erro ao descarregar dados' });
        const data = await response.text();
        res.json(parseCSV(data));
    } catch (error) {
        res.status(500).json({ error: 'Erro ao conectar ao Google Sheets' });
    }
});

app.post('/api/visitas', (req, res) => {
    const { 
        tipo_controle, nome_completo, parentesco, documento, 
        contato, paciente_nome, paciente_leito, paciente_setor, 
        possui_excecao, motivo_excecao, data_entrada, hora_entrada 
    } = req.body;

    const sql = `
        INSERT INTO visitas 
        (tipo_controle, nome_completo, parentesco, documento, contato, paciente_nome, paciente_leito, paciente_setor, possui_excecao, motivo_excecao, data_entrada, hora_entrada)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    db.run(sql, [
        tipo_controle, nome_completo, parentesco, documento, contato, 
        paciente_nome, paciente_leito, paciente_setor, 
        possui_excecao ? 'SIM' : 'NÃO', motivo_excecao || '-', 
        data_entrada, hora_entrada
    ], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: this.lastID, status: 'Sucesso' });
    });
});

app.get('/api/visitas', (req, res) => {
    db.all("SELECT * FROM visitas ORDER BY id DESC", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

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

const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const PORT = 3000;

// Configurar banco de dados SQLite local
const db = new sqlite3.Database('./visitas.db', (err) => {
    if (err) console.error('Erro ao abrir o banco de dados', err.message);
    else console.log('Conectado ao banco de dados SQLite.');
});

// Criar tabela se não existir (saida começa vazia/null)
db.run(`CREATE TABLE IF NOT EXISTS registros (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tipo_controle TEXT,
    nome TEXT,
    parentesco TEXT,
    documento TEXT,
    telefone TEXT,
    data_entrada TEXT,
    hora_entrada TEXT,
    data_saida TEXT,
    hora_saida TEXT
)`);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Rota para salvar apenas a ENTRADA
app.post('/api/salvar', (req, res) => {
    const { tipo_controle, nome, parentesco, documento, telefone, data_entrada, hora_entrada } = req.body;
    
    const query = `INSERT INTO registros (tipo_controle, nome, parentesco, documento, telefone, data_entrada, hora_entrada, data_saida, hora_saida) VALUES (?, ?, ?, ?, ?, ?, ?, '', '')`;
    
    db.run(query, [tipo_controle, nome, parentesco, documento, telefone, data_entrada, hora_entrada], function(err) {
        if (err) {
            return res.status(500).json({ sucesso: false, erro: err.message });
        }
        res.json({ sucesso: true, id: this.lastID });
    });
});

// Rota para consultar os registros
app.get('/api/registros', (req, res) => {
    db.all(`SELECT * FROM registros ORDER BY id DESC`, [], (err, rows) => {
        if (err) {
            return res.status(500).json({ sucesso: false, erro: err.message });
        }
        res.json({ sucesso: true, dados: rows });
    });
});

// Rota para registrar a SAÍDA pelo Histórico
app.post('/api/saida/:id', (req, res) => {
    const { id } = req.params;
    const { data_saida, hora_saida } = req.body;

    const query = `UPDATE registros SET data_saida = ?, hora_saida = ? WHERE id = ?`;

    db.run(query, [data_saida, hora_saida, id], function(err) {
        if (err) {
            return res.status(500).json({ sucesso: false, erro: err.message });
        }
        res.json({ sucesso: true });
    });
});

app.listen(PORT, () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
});


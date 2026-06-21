import fs from 'fs';
import path from 'path';
import { GoogleGenAI } from '@google/genai';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Carrega variáveis do arquivo .env local, se existir
const caminhoEnv = path.join(__dirname, '.env');
if (fs.existsSync(caminhoEnv)) {
    try {
        const conteudoEnv = fs.readFileSync(caminhoEnv, 'utf-8');
        conteudoEnv.split(/\r?\n/).forEach(linha => {
            const partes = linha.split('=');
            if (partes.length >= 2) {
                const chave = partes[0].trim();
                const valor = partes.slice(1).join('=').trim().replace(/^['"]|['"]$/g, '');
                if (chave && valor) {
                    process.env[chave] = valor;
                }
            }
        });
    } catch (e) {
        console.error('Erro ao ler o arquivo .env:', e.message);
    }
}

const pastaImagens = path.join(__dirname, 'imagens');
const pastaDados = path.join(__dirname, 'dados');

function extrairIndiceDoNome(nome) {
    const regex = /(\d{1,2})\s+de\s+([a-z]{3,9})(?:\.?\s+de\s+(\d{4}))?(?:\s+(\d{2})[.:](\d{2})[.:](\d{2}))?/i;
    const match = nome.match(regex);
    
    if (match) {
        const dia = match[1];
        const mesExtenso = match[2].toLowerCase().substring(0, 3);
        const ano = match[3] || new Date().getFullYear();
        const hora = match[4] || '00';
        const minuto = match[5] || '00';
        const segundo = match[6] || '00';
        
        const meses = {
            jan: '01', fev: '02', mar: '03', abr: '04', mai: '05', jun: '06',
            jul: '07', ago: '08', set: '09', out: '10', nov: '11', dez: '12'
        };
        
        const mes = meses[mesExtenso] || '01';
        return `${ano}-${mes}-${String(dia).padStart(2, '0')}_${hora}${minuto}${segundo}`;
    }
    return nome.replace(/[^a-zA-Z0-9]/g, '_');
}

if (!fs.existsSync(pastaImagens)) fs.mkdirSync(pastaImagens);
if (!fs.existsSync(pastaDados)) fs.mkdirSync(pastaDados);

async function executar() {
    // Inicialização oficial do novo SDK
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    // Primeiro, descobre qual o maior ID já atribuído nos JSONs existentes
    let maxId = 0;
    if (fs.existsSync(pastaDados)) {
        const arquivosExistentes = fs.readdirSync(pastaDados).filter(f => f.endsWith('.json') && f !== 'index.json');
        for (const arq of arquivosExistentes) {
            try {
                const conteudo = JSON.parse(fs.readFileSync(path.join(pastaDados, arq), 'utf-8'));
                const idExistente = conteudo.detalhes_partida?.id;
                if (typeof idExistente === 'number' && idExistente > maxId) {
                    maxId = idExistente;
                }
            } catch (e) {
                // ignora erros de leitura/parse de arquivos corrompidos
            }
        }
    }
    let proximoId = maxId + 1;

    // Filtra e ordena as imagens em ordem alfabética natural do nome do arquivo
    const arquivosImagens = fs.readdirSync(pastaImagens)
        .filter(f => /\.(png|jpg|jpeg)$/i.test(f))
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

    for (const arquivo of arquivosImagens) {
        const nomeSemExtensao = path.parse(arquivo).name;
        const arquivoJsonDestino = path.join(pastaDados, `${nomeSemExtensao}.json`);

        if (fs.existsSync(arquivoJsonDestino)) {
            console.log(`⏩ Ignorando ${arquivo} (já processado).`);
            continue;
        }

        console.log(`🤖 Processando com @google/genai: ${arquivo}...`);

        try {
            const imagemBuffer = fs.readFileSync(path.join(pastaImagens, arquivo));

            const prompt = `Analise a imagem deste bolão. Extraia os dados e retorne ESTRITAMENTE um objeto JSON liso, sem blocos de código markdown (\`\`\`json).
            Siga rigidamente este esquema:
            {
              "detalhes_partida": { "time_1": string, "time_2": string, "total_previsoes": number },
              "previsoes_membros": [
                {
                  "membro": string,
                  "dia_previsao": number,
                  "mes_previsao": number,
                  "hora_previsao": number,
                  "minuto_previsao": number,
                  "placar_time_1": number,
                  "placar_time_2": number,
                  "pontos": number
                }
              ]
            }`;

            // ESTRUTURA CORRETA DO NOVO SDK:
            // Passamos um objeto simples com 'inlineData' direto no array de contents
            const resultado = await ai.models.generateContent({
                model: 'gemini-3.5-flash',
                contents: [
                    prompt,
                    {
                        inlineData: {
                            // O novo SDK aceita a string base64 diretamente aqui
                            data: imagemBuffer.toString('base64'),
                            mimeType: "image/png"
                        }
                    }
                ]
            });

            // No novo SDK, o texto plano vem direto na propriedade .text
            const respostaTexto = resultado.text.trim();
            
            // Valida o JSON e injeta o ID sequencial programaticamente
            const dadosObjeto = JSON.parse(respostaTexto);
            if (!dadosObjeto.detalhes_partida) dadosObjeto.detalhes_partida = {};
            
            dadosObjeto.detalhes_partida.id = proximoId;
            proximoId++;

            fs.writeFileSync(arquivoJsonDestino, JSON.stringify(dadosObjeto, null, 2), 'utf-8');
            console.log(`✅ Dados salvos em: dados/${nomeSemExtensao}.json`);

        } catch (erro) {
            console.error(`❌ Erro ao processar o arquivo ${arquivo}:`, erro.message);
        }
    }

    // Gera o index.json consolidado para a página estática
    try {
        const arquivosJson = fs.readdirSync(pastaDados).filter(f => f.endsWith('.json') && f !== 'index.json');
        const indexDados = [];

        for (const arq of arquivosJson) {
            try {
                const conteudo = JSON.parse(fs.readFileSync(path.join(pastaDados, arq), 'utf-8'));
                indexDados.push({
                    arquivo: arq,
                    titulo: `${conteudo.detalhes_partida.time_1} vs ${conteudo.detalhes_partida.time_2}`,
                    id: conteudo.detalhes_partida?.id || 0
                });
            } catch (e) {
                console.error(`Erro ao ler ${arq} para o index:`, e.message);
            }
        }

        // Ordena por ID de forma decrescente (jogos mais recentes com maior ID primeiro)
        indexDados.sort((a, b) => b.id - a.id);

        fs.writeFileSync(path.join(pastaDados, 'index.json'), JSON.stringify(indexDados, null, 2), 'utf-8');
        console.log('✅ Arquivo dados/index.json atualizado.');
    } catch (erroIndex) {
        console.error('❌ Erro ao gerar dados/index.json:', erroIndex.message);
    }
}

executar();

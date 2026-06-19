const fs = require('fs');
const path = require('path');
// Correção aqui: O SDK exporta a classe GoogleGenAI dentro do pacote
const { GoogleGenAI } = require("@google/generative-ai"); 

const pastaImagens = path.join(__dirname, 'imagens');
const pastaDados = path.join(__dirname, 'dados');

if (!fs.existsSync(pastaImagens)) fs.mkdirSync(pastaImagens);
if (!fs.existsSync(pastaDados)) fs.mkdirSync(pastaDados);

async function executar() {
    // Agora a instância funcionará perfeitamente
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const modelo = ai.getGenerativeModel({ model: "gemini-1.5-flash" });

    const arquivosImagens = fs.readdirSync(pastaImagens).filter(f => /\.(png|jpg|jpeg)$/i.test(f));

    for (const arquivo of arquivosImagens) {
        const nomeSemExtensao = path.parse(arquivo).name;
        const arquivoJsonDestino = path.join(pastaDados, `${nomeSemExtensao}.json`);

        // Evita reprocessar e gastar cota da API à toa
        if (fs.existsSync(arquivoJsonDestino)) {
            console.log(`⏩ Ignorando ${arquivo} (já processado).`);
            continue;
        }

        console.log(`🤖 Processando com Gemini: ${arquivo}...`);

        try {
            const imagemBase64 = fs.readFileSync(path.join(pastaImagens, arquivo), { encoding: 'base64' });

            // Passamos o esquema exato diretamente no prompt (Structured Outputs alternativo)
            const prompt = `Analise a imagem deste bolão. Extraia os dados e retorne ESTRITAMENTE um objeto JSON liso, sem blocos de código markdown (\`\`\`json).
            Siga rigidamente este esquema:
            {
              "nome_torneio": string,
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

            const resultado = await modelo.generateContent([
                prompt,
                { inlineData: { data: imagemBase64, mimeType: "image/png" } }
            ]);

            const respostaTexto = resultado.response.text().trim();
            
            // Valida se a resposta é um JSON legítimo antes de salvar
            JSON.parse(respostaTexto); 

            fs.writeFileSync(arquivoJsonDestino, respuestaTexto, 'utf-8');
            console.log(`✅ Dados salvos com sucesso em: dados/${nomeSemExtensao}.json`);

        } catch (erro) {
            console.error(`❌ Erro ao processar o arquivo ${arquivo}:`, erro.message);
        }
    }
}

executar();

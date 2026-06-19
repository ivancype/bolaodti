const fs = require('fs');
const path = require('path');
// Importa a classe correta do novo SDK
const { GoogleGenAI } = require("@google/genai"); 

const pastaImagens = path.join(__dirname, 'imagens');
const pastaDados = path.join(__dirname, 'dados');

if (!fs.existsSync(pastaImagens)) fs.mkdirSync(pastaImagens);
if (!fs.existsSync(pastaDados)) fs.mkdirSync(pastaDados);

async function executar() {
    // No novo SDK, você passa o objeto com a propriedade apiKey
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    const arquivosImagens = fs.readdirSync(pastaImagens).filter(f => /\.(png|jpg|jpeg)$/i.test(f));

    for (const arquivo of arquivosImagens) {
        const nomeSemExtensao = path.parse(arquivo).name;
        const arquivoJsonDestino = path.join(pastaDados, `${nomeSemExtensao}.json`);

        if (fs.existsSync(arquivoJsonDestino)) {
            console.log(`⏩ Ignorando ${arquivo} (já processado).`);
            continue;
        }

        console.log(`🤖 Processando com o Novo SDK do Gemini: ${arquivo}...`);

        try {
            const imagemBase64 = fs.readFileSync(path.join(pastaImagens, arquivo), { encoding: 'base64' });

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

            // Mudança na API: Agora a chamada é feita através de ai.models.generateContent
            const resultado = await ai.models.generateContent({
                model: 'gemini-1.5-flash',
                contents: [
                    prompt,
                    {
                        inlineData: {
                            data: imagemBase64,
                            mimeType: "image/png"
                        }
                    }
                ]
            });

            const respostaTexto = resultado.text.trim();
            
            // Valida se veio um JSON correto
            JSON.parse(respostaTexto); 

            fs.writeFileSync(arquivoJsonDestino, respostaTexto, 'utf-8');
            console.log(`✅ Dados salvos em: dados/${nomeSemExtensao}.json`);

        } catch (erro) {
            console.error(`❌ Erro ao processar o arquivo ${arquivo}:`, erro.message);
        }
    }
}

executar();

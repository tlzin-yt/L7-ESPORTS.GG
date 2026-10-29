const { 
    Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, 
    ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, REST, Routes, 
    SlashCommandBuilder, PermissionFlagsBits, ModalBuilder, TextInputBuilder, TextInputStyle 
} = require('discord.js');
const http = require('http');
const admin = require('firebase-admin');

// Inicialização do Firebase
if (process.env.FIREBASE_CONFIG_JSON) {
    try {
        const serviceAccount = JSON.parse(process.env.FIREBASE_CONFIG_JSON);
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
        console.log('🔥 Firebase conectado com sucesso!');
    } catch (e) {
        console.error('❌ Erro ao ler FIREBASE_CONFIG_JSON:', e);
    }
}

const db = admin.apps.length ? admin.firestore() : null;

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildVoiceStates
    ]
});

// FUNÇÃO PARA SALVAR E SOMAR PONTOS NO FIREBASE
async function adicionarPontosGuerra(user, pontos) {
    if (!db) return;
    try {
        const ref = db.collection('guilda').doc('membros').collection('usuarios').doc(user.id);
        const doc = await ref.get();
        const atual = doc.exists ? (doc.data().pontosGuerra || 0) : 0;
        
        // Salva os pontos e atualiza o nome do usuário para o Dashboard
        await ref.set({ 
            pontosGuerra: atual + pontos,
            nome: user.username 
        }, { merge: true });
    } catch (e) {
        console.error("Erro no Firebase Guerra:", e);
    }
}

// MANIPULAÇÃO DE INTERAÇÕES
client.on('interactionCreate', async interaction => {
    try {
        // COMANDO SLASHPAYLOAD PAINEL META
        if (interaction.isChatInputCommand() && interaction.commandName === 'painel-meta') {
            const embed = new EmbedBuilder()
                .setTitle('📥 ENTREGA DE METAS DE GUERRA')
                .setDescription('Clique no botão abaixo para registrar os pontos obtidos nas partidas.')
                .setColor('#0055FF');

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('abrir_menu_meta')
                    .setLabel('🎯 Entregar Pontos de Meta')
                    .setStyle(ButtonStyle.Primary)
            );

            await interaction.reply({ embeds: [embed], components: [row] });
        }

        // CLIQUE NO BOTÃO "ENTREGAR PONTOS DE META"
        if (interaction.isButton() && interaction.customId === 'abrir_menu_meta') {
            // Cria um menu suspenso para escolher a quantidade de pontos
            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId('selecionar_pontos_meta')
                .setPlaceholder('Selecione a quantidade de pontos realizados...')
                .addOptions([
                    { label: '100 Pontos', value: '100', description: 'Meta básica de partidas' },
                    { label: '250 Pontos', value: '250', description: 'Meta intermediária' },
                    { label: '500 Pontos', value: '500', description: 'Meta avançada' },
                    { label: '1.000 Pontos', value: '1000', description: 'Meta diária concluída' },
                    { label: '✏️ Digitar outro valor...', value: 'custom', description: 'Digite manualmente a pontuação' }
                ]);

            const row = new ActionRowBuilder().addComponents(selectMenu);

            await interaction.reply({
                content: 'Selecione abaixo quantos pontos você fez:',
                components: [row],
                ephemeral: true
            });
        }

        // QUANDO SELECIONA UMA OPÇÃO NO MENU
        if (interaction.isStringSelectMenu() && interaction.customId === 'selecionar_pontos_meta') {
            const valorSelecionado = interaction.values[0];

            if (valorSelecionado === 'custom') {
                // Abre uma caixa de texto (Modal) para digitar o valor
                const modal = new ModalBuilder()
                    .setCustomId('modal_pontos_custom')
                    .setTitle('Digitar Pontuação de Meta');

                const inputPontos = new TextInputBuilder()
                    .setCustomId('input_qtd_pontos')
                    .setLabel('Quantidade de Pontos')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('Ex: 350')
                    .setRequired(true);

                const modalRow = new ActionRowBuilder().addComponents(inputPontos);
                modal.addComponents(modalRow);

                await interaction.showModal(modal);
            } else {
                await interaction.deferUpdate();
                const pontos = parseInt(valorSelecionado, 10);
                await adicionarPontosGuerra(interaction.user, pontos);

                await interaction.editReply({
                    content: `✅ **+${pontos} pontos** de meta entregues com sucesso e salvos no Firebase!`,
                    components: []
                });
            }
        }

        // PROCESSAR O VALOR DIGITADO NO MODAL (QUANDO ESCOLHE "DIGITAR OUTRO VALOR")
        if (interaction.isModalSubmit() && interaction.customId === 'modal_pontos_custom') {
            await interaction.deferReply({ ephemeral: true });
            const valorDigitado = interaction.fields.getTextInputValue('input_qtd_pontos');
            const pontos = parseInt(valorDigitado, 10);

            if (isNaN(pontos) || pontos <= 0) {
                return await interaction.editReply({ content: '❌ Por favor, digite um número válido e maior que zero.' });
            }

            await adicionarPontosGuerra(interaction.user, pontos);
            await interaction.editReply({
                content: `✅ **+${pontos} pontos** de meta entregues com sucesso e salvos no Firebase!`
            });
        }

    } catch (err) {
        console.error('Erro na interatividade:', err);
    }
});

http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Bot online!');
}).listen(process.env.PORT || 3000);

client.login(process.env.DISCORD_TOKEN);

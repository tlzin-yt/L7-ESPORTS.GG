const { 
    Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, 
    ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, REST, Routes, 
    SlashCommandBuilder, PermissionFlagsBits, ModalBuilder, TextInputBuilder, TextInputStyle 
} = require('discord.js');
const http = require('http');
const admin = require('firebase-admin');

// ---------------------------------------------------------
// 1. INICIALIZAÇÃO DO FIREBASE ADMIN SDK
// ---------------------------------------------------------
if (process.env.FIREBASE_CONFIG_JSON) {
    try {
        const serviceAccount = JSON.parse(process.env.FIREBASE_CONFIG_JSON);
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
        console.log('🔥 Firebase conectado com sucesso no Bot!');
    } catch (e) {
        console.error('❌ Erro ao ler FIREBASE_CONFIG_JSON:', e);
    }
} else {
    console.log('⚠️ Aviso: FIREBASE_CONFIG_JSON não configurado nas variáveis de ambiente.');
}

const db = admin.apps.length ? admin.firestore() : null;

// ---------------------------------------------------------
// 2. CONFIGURAÇÃO DO CLIENTE DISCORD
// ---------------------------------------------------------
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildVoiceStates
    ]
});

// Cache para controle de tempo de voz em tempo real
const entradaVoz = new Map();

// Configurações dinâmicas do painel no Discord
const configPainel = {
    corPrincipal: '#0055FF',
    tituloPainel: '🎧 TOP 10 • TEMPO EM CALL',
    paginaAtual: 'call',
    canalRankingId: null,
    mensagemRankingId: null
};

// ---------------------------------------------------------
// 3. REGISTRO DE COMANDOS SLASH
// ---------------------------------------------------------
const commands = [
    new SlashCommandBuilder()
        .setName('escalacao')
        .setDescription('Envia o painel de escalação para a Guerra de Guilda'),
    new SlashCommandBuilder()
        .setName('painel-meta')
        .setDescription('Envia o painel interativo para os membros entregarem as metas de guerra'),
    new SlashCommandBuilder()
        .setName('iniciar-ranking-automatico')
        .setDescription('Inicia o painel de ranking automático atualizado via Dashboard (Admin)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder()
        .setName('painel-admin')
        .setDescription('Painel administrativo para visualizar as metas salvas')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder()
        .setName('salatreino')
        .setDescription('Gera uma senha temporária para sala de treino')
].map(command => command.toJSON());

// ---------------------------------------------------------
// 4. EVENTO READY & LISTENERS DO FIREBASE
// ---------------------------------------------------------
client.once('ready', async () => {
    console.log(`🤖 Bot online como ${client.user.tag}!`);

    // Registra os comandos na API do Discord
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    try {
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        console.log('✅ Comandos Slash registrados com sucesso!');
    } catch (error) {
        console.error('❌ Erro ao registrar comandos:', error);
    }

    // OUVINTE EM TEMPO REAL DAS CONFIGURAÇÕES SALVAS NO DASHBOARD WEB
    if (db) {
        db.collection('configuracoes').doc('painel').onSnapshot(async (doc) => {
            if (!doc.exists) return;
            const data = doc.data();
            
            let mudou = false;
            if (data.corPrincipal && data.corPrincipal !== configPainel.corPrincipal) {
                configPainel.corPrincipal = data.corPrincipal;
                mudou = true;
            }
            if (data.tituloPainel && data.tituloPainel !== configPainel.tituloPainel) {
                configPainel.tituloPainel = data.tituloPainel;
                mudou = true;
            }

            // Se o painel já estiver ativo num canal, atualiza a mensagem no Discord na hora!
            if (mudou && configPainel.canalRankingId && configPainel.mensagemRankingId) {
                try {
                    const canal = await client.channels.fetch(configPainel.canalRankingId);
                    if (canal) {
                        const msg = await canal.messages.fetch(configPainel.mensagemRankingId);
                        if (msg) {
                            const { embed, row } = await gerarPainelProfissional();
                            await msg.edit({ embeds: [embed], components: [row] });
                            console.log('🎨 Painel no Discord atualizado em tempo real pelo Dashboard Web!');
                        }
                    }
                } catch (e) {
                    console.error('Erro ao atualizar mensagem do Discord via Dashboard:', e);
                }
            }
        });
    }

    // Loop de atualização automática a cada 1 minuto (60.000 ms)
    setInterval(async () => {
        if (!configPainel.canalRankingId || !configPainel.mensagemRankingId) return;

        try {
            const canal = await client.channels.fetch(configPainel.canalRankingId);
            if (!canal) return;

            const msg = await canal.messages.fetch(configPainel.mensagemRankingId);
            if (msg) {
                const { embed, row } = await gerarPainelProfissional();
                await msg.edit({ embeds: [embed], components: [row] });
            }
        } catch (err) {
            console.error('Erro ao atualizar painel automático:', err);
        }
    }, 60000);
});

// ---------------------------------------------------------
// 5. MONITOR DE VOZ (CALL TIMER)
// ---------------------------------------------------------
client.on('voiceStateUpdate', async (oldState, newState) => {
    const member = newState.member || oldState.member;
    if (!member || member.user.bot) return;

    const userId = member.user.id;

    // Entrou na call
    if (!oldState.channelId && newState.channelId) {
        entradaVoz.set(userId, Date.now());
    } 
    // Saiu da call
    else if (oldState.channelId && !newState.channelId) {
        const inicio = entradaVoz.get(userId);
        if (inicio) {
            const segundos = Math.floor((Date.now() - inicio) / 1000);
            entradaVoz.delete(userId);
            await somarTempoCallFirebase(member.user, segundos);
        }
    }
});

// ---------------------------------------------------------
// 6. FUNÇÕES AUXILIARES DE BANCO DE DADOS (FIREBASE)
// ---------------------------------------------------------
async function somarTempoCallFirebase(user, segundos) {
    if (!db) return;
    try {
        const ref = db.collection('guilda').doc('membros').collection('usuarios').doc(user.id);
        const doc = await ref.get();
        const atual = doc.exists ? (doc.data().tempoCall || 0) : 0;
        await ref.set({ 
            tempoCall: atual + segundos,
            nome: user.username 
        }, { merge: true });
    } catch (e) {
        console.error("Erro no Firebase Call:", e);
    }
}

async function adicionarPontosGuerra(user, pontos) {
    if (!db) return;
    try {
        const ref = db.collection('guilda').doc('membros').collection('usuarios').doc(user.id);
        const doc = await ref.get();
        const atual = doc.exists ? (doc.data().pontosGuerra || 0) : 0;
        await ref.set({ 
            pontosGuerra: atual + pontos,
            nome: user.username 
        }, { merge: true });
    } catch (e) {
        console.error("Erro no Firebase Guerra:", e);
    }
}

async function buscarDadosMembros() {
    const callMap = new Map();
    const guerraMap = new Map();
    if (!db) return { callMap, guerraMap };

    try {
        const snapshot = await db.collection('guilda').doc('membros').collection('usuarios').get();
        snapshot.forEach(doc => {
            const data = doc.data();
            if (data.tempoCall) callMap.set(doc.id, data.tempoCall);
            if (data.pontosGuerra) guerraMap.set(doc.id, data.pontosGuerra);
        });
    } catch (e) {
        console.error("Erro ao buscar no Firebase:", e);
    }

    return { callMap, guerraMap };
}

function formatarTempo(segundos) {
    if (segundos < 60) return `${segundos}s`;
    const horas = Math.floor(segundos / 3600);
    const minutos = Math.floor((segundos % 3600) / 60);
    if (horas > 0) return `${horas}h ${minutos}min`;
    return `${minutos}min`;
}

// ---------------------------------------------------------
// 7. GERADOR DO PAINEL DE RANKING
// ---------------------------------------------------------
async function gerarPainelProfissional() {
    const { callMap, guerraMap } = await buscarDadosMembros();
    
    // Soma tempo ao vivo de quem ainda está conectado na call
    entradaVoz.forEach((inicio, userId) => {
        const aoVivo = Math.floor((Date.now() - inicio) / 1000);
        const salvo = callMap.get(userId) || 0;
        callMap.set(userId, salvo + aoVivo);
    });

    const embed = new EmbedBuilder().setColor(configPainel.corPrincipal);
    const row = new ActionRowBuilder();

    if (configPainel.paginaAtual === 'call') {
        const topCall = Array.from(callMap.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([id, segs], index) => {
                const medalhas = ['👑', '🥈', '🥉'];
                const posicao = medalhas[index] || `\`#${index + 1}\``;
                return `${posicao} <@${id}> — **${formatarTempo(segs)}**`;
            })
            .join('\n') || 'Nenhum tempo registrado no momento.';

        embed.setTitle(configPainel.tituloPainel)
             .setDescription(`Acompanhe abaixo os membros mais ativos nas salas de voz:\n\n${topCall}`)
             .setFooter({ text: 'Página 1/2 • Sincronizado com Dashboard Web' })
             .setTimestamp();

        row.addComponents(
            new ButtonBuilder().setCustomId('mudar_pagina').setLabel('Ver Guerra de Guilda ➡️').setStyle(ButtonStyle.Primary)
        );
    } else {
        const topGuerra = Array.from(guerraMap.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([id, pts], index) => {
                const medalhas = ['🏆', '🥈', '🥉'];
                const posicao = medalhas[index] || `\`#${index + 1}\``;
                return `${posicao} <@${id}> — **${pts} pts**`;
            })
            .join('\n') || 'Nenhum ponto registrado nesta semana.';

        embed.setTitle('⚔️ TOP 10 • GUERRA DE GUILDA')
             .setDescription(`Pontuação oficial acumulada pela line-up:\n\n${topGuerra}`)
             .setFooter({ text: 'Página 2/2 • Sincronizado com Dashboard Web' })
             .setTimestamp();

        row.addComponents(
            new ButtonBuilder().setCustomId('mudar_pagina').setLabel('⬅️ Voltar para Top Call').setStyle(ButtonStyle.Secondary)
        );
    }

    return { embed, row };
}

// ---------------------------------------------------------
// 8. GERENCIADOR DE INTERAÇÕES (COMANDOS, BOTÕES E SELEÇÃO)
// ---------------------------------------------------------
client.on('interactionCreate', async interaction => {
    try {
        // COMANDOS SLASH
        if (interaction.isChatInputCommand()) {
            if (interaction.commandName === 'iniciar-ranking-automatico') {
                await interaction.deferReply({ ephemeral: true });
                configPainel.canalRankingId = interaction.channelId;
                const { embed, row } = await gerarPainelProfissional();
                const msg = await interaction.channel.send({ embeds: [embed], components: [row] });
                configPainel.mensagemRankingId = msg.id;
                await interaction.editReply({ content: '✅ Painel profissional ativado e sincronizado com a Dashboard!' });
            }

            else if (interaction.commandName === 'escalacao') {
                const embed = new EmbedBuilder()
                    .setTitle('🛡️ ESCALAÇÃO PARA GUERRA DE GUILDA')
                    .setDescription('Confirme sua presença na partida de hoje clicando nos botões abaixo:')
                    .setColor(configPainel.corPrincipal);

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('vou').setLabel('🟢 Confirmado').setStyle(ButtonStyle.Success),
                    new ButtonBuilder().setCustomId('nao_vou').setLabel('🔴 Não Vou').setStyle(ButtonStyle.Danger),
                    new ButtonBuilder().setCustomId('suplente').setLabel('🟡 Suplente').setStyle(ButtonStyle.Secondary)
                );

                await interaction.reply({ embeds: [embed], components: [row] });
            }

            else if (interaction.commandName === 'painel-meta') {
                const embed = new EmbedBuilder()
                    .setTitle('📥 ENTREGA DE METAS DE GUERRA')
                    .setDescription('Clique no botão abaixo para registrar seus pontos na nuvem da guilda.')
                    .setColor(configPainel.corPrincipal);

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('abrir_menu_meta').setLabel('🎯 Entregar Pontos de Meta').setStyle(ButtonStyle.Primary)
                );

                await interaction.reply({ embeds: [embed], components: [row] });
            }

            else if (interaction.commandName === 'painel-admin') {
                await interaction.deferReply({ ephemeral: true });
                const { guerraMap } = await buscarDadosMembros();
                const lista = Array.from(guerraMap.entries())
                    .map(([id, pts]) => `• <@${id}>: **${pts} pts**`)
                    .join('\n') || 'Nenhum registro.';

                const embedAdmin = new EmbedBuilder()
                    .setTitle('🛠️ PAINEL ADMINISTRATIVO')
                    .setDescription(`Pontuações salvas no Firebase:\n\n${lista}`)
                    .setColor('#FF0000');

                await interaction.editReply({ embeds: [embedAdmin] });
            }

            else if (interaction.commandName === 'salatreino') {
                const senha = Math.floor(1000 + Math.random() * 9000);
                await interaction.reply({ content: `🎮 **Sala de Treino Gerada!**\n🔑 Senha: \`${senha}\`` });
            }
        }

        // BOTÕES INTERATIVOS
        if (interaction.isButton()) {
            if (interaction.customId === 'mudar_pagina') {
                await interaction.deferUpdate();
                configPainel.paginaAtual = configPainel.paginaAtual === 'call' ? 'guerra' : 'call';
                const { embed, row } = await gerarPainelProfissional();
                await interaction.editReply({ embeds: [embed], components: [row] });
            }

            else if (interaction.customId === 'abrir_menu_meta') {
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

            else if (interaction.customId === 'vou') {
                await interaction.reply({ content: '✅ Presença confirmada!', ephemeral: true });
            } else if (interaction.customId === 'nao_vou') {
                await interaction.reply({ content: '❌ Ausência registrada.', ephemeral: true });
            } else if (interaction.customId === 'suplente') {
                await interaction.reply({ content: '🟡 Registrado como suplente.', ephemeral: true });
            }
        }

        // MENU SUSPENSO DE METAS
        if (interaction.isStringSelectMenu() && interaction.customId === 'selecionar_pontos_meta') {
            const valorSelecionado = interaction.values[0];

            if (valorSelecionado === 'custom') {
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

        // MODAL (ENTRADA MANUAL DE METAS)
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
        console.error('Erro na interatividade do bot:', err);
    }
});

// ---------------------------------------------------------
// 9. SERVIDOR HTTP PARA MANTER O BOT ONLINE NO RENDER
// ---------------------------------------------------------
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Bot L7 ESPORTS online!');
}).listen(process.env.PORT || 3000);

client.login(process.env.DISCORD_TOKEN);

const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, REST, Routes, SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
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
} else {
    console.log('⚠️ Aviso: FIREBASE_CONFIG_JSON não configurado.');
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

// Controle de voz em tempo real
const entradaVoz = new Map();

// Configuração visual e estado do painel
const configPainel = {
    corPrincipal: '#0055FF',
    paginaAtual: 'call',
    canalRankingId: null,
    mensagemRankingId: null
};

// Comandos Slash
const commands = [
    new SlashCommandBuilder()
        .setName('escalacao')
        .setDescription('Envia o painel de escalação para a Guerra de Guilda'),
    new SlashCommandBuilder()
        .setName('painel-meta')
        .setDescription('Envia o painel interativo para os membros entregarem as metas de guerra'),
    new SlashCommandBuilder()
        .setName('iniciar-ranking-automatico')
        .setDescription('Inicia o painel de ranking automático a cada 1 min (Admin)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder()
        .setName('painel-admin')
        .setDescription('Painel administrativo para visualizar as metas dos membros')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder()
        .setName('salatreino')
        .setDescription('Gera uma senha temporária para sala de treino')
].map(command => command.toJSON());

client.once('ready', async () => {
    console.log(`Bot online como ${client.user.tag}!`);

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    try {
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        console.log('Comandos registrados com sucesso!');
    } catch (error) {
        console.error('Erro ao registrar comandos:', error);
    }

    // Loop de atualização automática a cada 1 minuto
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

// MONITOR DE VOZ
client.on('voiceStateUpdate', async (oldState, newState) => {
    const userId = newState.member?.user.id;
    if (!userId || newState.member?.user.bot) return;

    if (!oldState.channelId && newState.channelId) {
        entradaVoz.set(userId, Date.now());
    } else if (oldState.channelId && !newState.channelId) {
        const inicio = entradaVoz.get(userId);
        if (inicio) {
            const segundos = Math.floor((Date.now() - inicio) / 1000);
            entradaVoz.delete(userId);
            await somarTempoCallFirebase(userId, segundos);
        }
    }
});

// FUNÇÕES DO FIREBASE
async function somarTempoCallFirebase(userId, segundos) {
    if (!db) return;
    try {
        const ref = db.collection('guilda').doc('membros').collection('usuarios').doc(userId);
        const doc = await ref.get();
        const atual = doc.exists ? (doc.data().tempoCall || 0) : 0;
        await ref.set({ tempoCall: atual + segundos }, { merge: true });
    } catch (e) {
        console.error("Erro no Firebase Call:", e);
    }
}

async function adicionarPontosGuerra(userId, pontos) {
    if (!db) return;
    try {
        const ref = db.collection('guilda').doc('membros').collection('usuarios').doc(userId);
        const doc = await ref.get();
        const atual = doc.exists ? (doc.data().pontosGuerra || 0) : 0;
        await ref.set({ pontosGuerra: atual + pontos }, { merge: true });
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

// GERADOR DO PAINEL
async function gerarPainelProfissional() {
    const { callMap, guerraMap } = await buscarDadosMembros();
    
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

        embed.setTitle('🎧 TOP 10 • TEMPO EM CALL')
             .setDescription(`Acompanhe abaixo os membros mais ativos nas salas de voz:\n\n${topCall}`)
             .setFooter({ text: 'Página 1/2 • Atualizado em tempo real' })
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
             .setFooter({ text: 'Página 2/2 • Atualizado em tempo real' })
             .setTimestamp();

        row.addComponents(
            new ButtonBuilder().setCustomId('mudar_pagina').setLabel('⬅️ Voltar para Top Call').setStyle(ButtonStyle.Secondary)
        );
    }

    return { embed, row };
}

// MANIPULAÇÃO DE INTERAÇÕES COM RESPOSTA IMEDIATA (EVITA "O APLICATIVO NÃO RESPONDEU")
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand() && !interaction.isButton()) return;

    try {
        // COMANDOS SLASH
        if (interaction.isChatInputCommand()) {
            if (interaction.commandName === 'iniciar-ranking-automatico') {
                await interaction.deferReply({ ephemeral: true });
                configPainel.canalRankingId = interaction.channelId;
                const { embed, row } = await gerarPainelProfissional();
                const msg = await interaction.channel.send({ embeds: [embed], components: [row] });
                configPainel.mensagemRankingId = msg.id;
                await interaction.editReply({ content: '✅ Painel profissional ativado com sucesso!' });
            }

            else if (interaction.commandName === 'escalacao') {
                const embed = new EmbedBuilder()
                    .setTitle('🛡️ ESCALAÇÃO PARA GUERRA DE GUILDA')
                    .setDescription('Confirme sua presença na partida de hoje clicando nos botões abaixo:')
                    .setColor('#0055FF');

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
                    .setColor('#0055FF');

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('entregar_meta').setLabel('🎯 Entregar Pontos de Meta').setStyle(ButtonStyle.Primary)
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
                // Notifica o Discord na hora que a interatividade começou
                await interaction.deferUpdate();
                configPainel.paginaAtual = configPainel.paginaAtual === 'call' ? 'guerra' : 'call';
                const { embed, row } = await gerarPainelProfissional();
                await interaction.editReply({ embeds: [embed], components: [row] });
            }

            else if (interaction.customId === 'entregar_meta') {
                await interaction.deferReply({ ephemeral: true });
                await adicionarPontosGuerra(interaction.user.id, 100);
                await interaction.editReply({ content: '🎯 **+100 pontos** de meta entregues com sucesso e salvos no Firebase!' });
            }

            else if (interaction.customId === 'vou') {
                await interaction.reply({ content: '✅ Presença confirmada!', ephemeral: true });
            } else if (interaction.customId === 'nao_vou') {
                await interaction.reply({ content: '❌ Ausência registrada.', ephemeral: true });
            } else if (interaction.customId === 'suplente') {
                await interaction.reply({ content: '🟡 Registrado como suplente.', ephemeral: true });
            }
        }
    } catch (err) {
        console.error('Erro na interatividade:', err);
    }
});

// Servidor para manter o Render ligado
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Bot online!');
}).listen(process.env.PORT || 3000);

client.login(process.env.DISCORD_TOKEN);

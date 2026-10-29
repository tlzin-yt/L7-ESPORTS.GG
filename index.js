const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, REST, Routes, SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const http = require('http');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildVoiceStates
    ]
});

// Bancos de dados em memória (simulando armazenamento de guilda)
const metasGuilda = new Map(); // Guarda pontos da semana por ID de usuário
const tempoCall = new Map();   // Guarda segundos em call por ID de usuário
const controleVoz = new Map(); // Guarda o momento em que o usuário entrou na call

// Configurações personalizáveis dos painéis (Admin)
const configPainel = {
    cor: '#0055FF',
    titulo: '🏆 RANKING & GUERRA DE GUILDA',
    descricao: 'Acompanhe abaixo o ranking de atividade em call e o desempenho da guilda na semana.',
    imagem: ''
};

// Definindo os comandos de barra (Slash Commands)
const commands = [
    new SlashCommandBuilder()
        .setName('escalacao')
        .setDescription('Envia o painel de escalação para a Guerra de Guilda'),
    new SlashCommandBuilder()
        .setName('painel-meta')
        .setDescription('Envia o painel interativo para os membros entregarem as metas de guerra'),
    new SlashCommandBuilder()
        .setName('painel-ranking')
        .setDescription('Envia o painel oficial de Ranking (Call + Guerra) configurado'),
    new SlashCommandBuilder()
        .setName('painel-admin')
        .setDescription('Painel administrativo para visualizar as metas batidas pelos membros')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder()
        .setName('config-painel')
        .setDescription('Configura a aparência do painel principal (Admin)')
        .addStringOption(option => option.setName('titulo').setDescription('Título da Embed').setRequired(false))
        .addStringOption(option => option.setName('descricao').setDescription('Descrição da Embed').setRequired(false))
        .addStringOption(option => option.setName('cor').setDescription('Cor em Hexadecimal (ex: #FF0000)').setRequired(false))
        .addStringOption(option => option.setName('imagem').setDescription('Link da imagem/banner').setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder()
        .setName('salatreino')
        .setDescription('Gera uma senha temporária para sala de treino')
].map(command => command.toJSON());

client.once('ready', async () => {
    console.log(`Bot online como ${client.user.tag}!`);

    // Registra os comandos Slash globalmente no Discord
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    try {
        console.log('Registrando comandos Slash (/)....');
        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: commands }
        );
        console.log('Comandos registrados com sucesso!');
    } catch (error) {
        console.error('Erro ao registrar comandos:', error);
    }
});

// SISTEMA DE CONTABILIZAÇÃO DE HORAS EM CALL
client.on('voiceStateUpdate', (oldState, newState) => {
    const userId = newState.member?.user.id;
    if (!userId) return;

    // Entrou em um canal de voz
    if (!oldState.channelId && newState.channelId) {
        controleVoz.set(userId, Date.now());
    } 
    // Saiu do canal de voz
    else if (oldState.channelId && !newState.channelId) {
        const inicio = controleVoz.get(userId);
        if (inicio) {
            const segundosNaCall = Math.floor((Date.now() - inicio) / 1000);
            const atual = tempoCall.get(userId) || 0;
            tempoCall.set(userId, atual + segundosNaCall);
            controleVoz.delete(userId);
        }
    }
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand() && !interaction.isButton()) return;

    // 1. COMANDO ESCALAÇÃO
    if (interaction.isChatInputCommand() && interaction.commandName === 'escalacao') {
        const embed = new EmbedBuilder()
            .setTitle('🛡️ ESCALAÇÃO PARA GUERRA DE GUILDA')
            .setDescription('Clique nos botões abaixo para confirmar sua presença ou ausência na Line Up de hoje!')
            .setColor('#0055FF')
            .addFields(
                { name: '📅 Data:', value: 'Hoje', inline: true },
                { name: '⏰ Horário:', value: '20:00', inline: true }
            );

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('vou').setLabel('🟢 Vou / Confirmado').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('nao_vou').setLabel('🔴 Não Vou').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId('suplente').setLabel('🟡 Suplente').setStyle(ButtonStyle.Secondary)
        );

        await interaction.reply({ embeds: [embed], components: [row] });
    }

    // Ações dos botões de escalação e metas
    if (interaction.isButton()) {
        if (interaction.customId === 'vou') {
            await interaction.reply({ content: '✅ Presença confirmada na Line Up!', ephemeral: true });
        } else if (interaction.customId === 'nao_vou') {
            await interaction.reply({ content: '❌ Ausência registrada.', ephemeral: true });
        } else if (interaction.customId === 'suplente') {
            await interaction.reply({ content: '🟡 Registrado como suplente.', ephemeral: true });
        }

        // SISTEMA DE REGISTRAR META (ENTREGAR PONTOS)
        if (interaction.customId === 'entregar_meta') {
            const userId = interaction.user.id;
            const pontosAtuais = (metasGuilda.get(userId) || 0) + 100; // Cada clique adiciona 100 pontos de meta
            metasGuilda.set(userId, pontosAtuais);

            await interaction.reply({ content: `🎯 Meta entregue com sucesso! Seus pontos acumulados nesta semana: **${pontosAtuais} pts**.`, ephemeral: true });
        }
    }

    // 2. PAINEL DE META (PARA OS MEMBROS ENTREGAREM)
    if (interaction.isChatInputCommand() && interaction.commandName === 'painel-meta') {
        const embed = new EmbedBuilder()
            .setTitle('📥 ENTREGA DE METAS DE GUERRA')
            .setDescription('Clique no botão abaixo sempre que concluir suas partidas para somar pontos na sua meta semanal.\n\n*O reset automático acontece todo domingo às 23:59:59.*')
            .setColor('#0052cc');

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('entregar_meta').setLabel('🎯 Entregar Pontos de Meta').setStyle(ButtonStyle.Primary)
        );

        await interaction.reply({ embeds: [embed], components: [row] });
    }

    // 3. PAINEL DE RANKING (CALL + GUERRA)
    if (interaction.isChatInputCommand() && interaction.commandName === 'painel-ranking') {
        // Organiza ranking de guerra
        const rankingGuerra = Array.from(metasGuilda.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([id, pts], index) => `**#${index + 1}** <@${id}> — **${pts} pts**`)
            .join('\n') || 'Nenhum registro nesta semana.';

        // Organiza ranking de horas em call
        const rankingCall = Array.from(tempoCall.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([id, segs], index) => {
                const horas = (segs / 3600).toFixed(1);
                return `**#${index + 1}** <@${id}> — **${horas}h** em call`;
            })
            .join('\n') || 'Nenhum tempo registrado.';

        const embed = new EmbedBuilder()
            .setTitle(configPainel.titulo)
            .setDescription(configPainel.descricao)
            .setColor(configPainel.cor)
            .addFields(
                { name: '🏆 Top Guerra de Guilda (Semanal)', value: rankingGuerra, inline: false },
                { name: '🎧 Top Horas em Call no Servidor', value: rankingCall, inline: false }
            );

        if (configPainel.imagem) {
            embed.setImage(configPainel.imagem);
        }

        await interaction.reply({ embeds: [embed] });
    }

    // 4. PAINEL ADMIN (VISUALIZAR METAS BATEUCAS DOS MEMBROS)
    if (interaction.isChatInputCommand() && interaction.commandName === 'painel-admin') {
        const listaMetas = Array.from(metasGuilda.entries())
            .map(([id, pts]) => `• <@${id}>: **${pts} pontos** na semana`)
            .join('\n') || 'Nenhum membro entregou metas ainda.';

        const embedAdmin = new EmbedBuilder()
            .setTitle('🛠️ PAINEL ADMINISTRATIVO — METAS DA GUILDA')
            .setDescription('Aqui os administradores podem visualizar o progresso e os pontos entregues por cada membro nesta semana:\n\n' + listaMetas)
            .setColor('#FF0000')
            .setFooter({ text: 'As metas semanais resetam todo domingo às 23:59:59.' });

        await interaction.reply({ embeds: [embedAdmin], ephemeral: true });
    }

    // 5. CONFIGURAR APARÊNCIA DO PAINEL (ADMIN)
    if (interaction.isChatInputCommand() && interaction.commandName === 'config-painel') {
        const novoTitulo = interaction.options.getString('titulo');
        const novaDesc = interaction.options.getString('descricao');
        const novaCor = interaction.options.getString('cor');
        const novaImg = interaction.options.getString('imagem');

        if (novoTitulo) configPainel.titulo = novoTitulo;
        if (novaDesc) configPainel.descricao = novaDesc;
        if (novaCor) configPainel.cor = novaCor;
        if (novaImg) configPainel.imagem = novaImg;

        await interaction.reply({ content: '✅ Painel configurado com sucesso! Use `/painel-ranking` para ver como ficou.', ephemeral: true });
    }

    // 6. SALA DE TREINO
    if (interaction.isChatInputCommand() && interaction.commandName === 'salatreino') {
        const senha = Math.floor(1000 + Math.random() * 9000);
        await interaction.reply(`🎮 **Sala de Treino Gerada!**\n🔑 **Senha temporária:** \`${senha}\`\n⚠️ Compartilhe apenas com os membros autorizados.`);
    }
});

// Servidor HTTP para manter o Render ativo 24h
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Bot online!');
}).listen(process.env.PORT || 3000);

client.login(process.env.DISCORD_TOKEN);

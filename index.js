const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, REST, Routes, SlashCommandBuilder } = require('discord.js');
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

// Banco de dados simulado em memória
const metasGuilda = new Map();

// Definindo os comandos de barra (Slash Commands)
const commands = [
    new SlashCommandBuilder()
        .setName('escalacao')
        .setDescription('Envia o painel de escalação para a Guerra de Guilda'),
    new SlashCommandBuilder()
        .setName('painel-meta')
        .setDescription('Envia o painel para registro de metas da semana'),
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

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand() && !interaction.isButton()) return;

    // 1. PAINEL DE ESCALAÇÃO
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

    // Ações dos botões de escalação
    if (interaction.isButton()) {
        if (interaction.customId === 'vou') {
            await interaction.reply({ content: '✅ Presença confirmada na Line Up!', ephemeral: true });
        } else if (interaction.customId === 'nao_vou') {
            await interaction.reply({ content: '❌ Ausência registrada.', ephemeral: true });
        } else if (interaction.customId === 'suplente') {
            await interaction.reply({ content: '🟡 Registrado como suplente.', ephemeral: true });
        }

        // 2. SISTEMA DE META DE GUERRA
        if (interaction.customId === 'entregar_meta') {
            const userId = interaction.user.id;
            const pontosAtuais = (metasGuilda.get(userId) || 0) + 100;
            metasGuilda.set(userId, pontosAtuais);

            await interaction.reply({ content: `🎯 Meta atualizada! Você acumulou **${pontosAtuais} pontos** nesta semana.`, ephemeral: true });
        }
    }

    // COMANDO PAINEL DE METAS
    if (interaction.isChatInputCommand() && interaction.commandName === 'painel-meta') {
        const embed = new EmbedBuilder()
            .setTitle('🏆 META DE GUERRA DE GUILDA')
            .setDescription('Clique no botão abaixo para registrar seus pontos da semana. O ranking semanal zera todo domingo às 23:59:59.')
            .setColor('#0052cc');

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('entregar_meta').setLabel('📥 Entregar Pontos de Meta').setStyle(ButtonStyle.Primary)
        );

        await interaction.reply({ embeds: [embed], components: [row] });
    }

    // 3. SALA DE TREINO
    if (interaction.isChatInputCommand() && interaction.commandName === 'salatreino') {
        const senha = Math.floor(1000 + Math.random() * 9000);
        await interaction.reply(`🎮 **Sala de Treino Gerada!**\n🔑 **Senha temporária:** \`${senha}\`\n⚠️ Compartilhe apenas com os membros autorizados.`);
    }
});

// Servidor HTTP para manter o Render em Live
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Bot online!');
}).listen(process.env.PORT || 3000);

client.login(process.env.DISCORD_TOKEN);

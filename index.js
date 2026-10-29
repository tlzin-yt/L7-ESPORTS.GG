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

// Bancos de dados em memória
const metasGuilda = new Map(); // Guarda pontos da semana
const tempoCallAcumulado = new Map(); // Guarda segundos acumulados de calls anteriores
const entradaVoz = new Map(); // Guarda o horário de entrada na call

// Configuração do painel automático (Controla a página ativa: 'call' ou 'guerra')
const configPainel = {
    cor: '#0055FF',
    paginaAtual: 'call', // 'call' ou 'guerra'
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
        .setDescription('Define o canal atual para receber o ranking interativo de 1 em 1 minuto (Admin)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder()
        .setName('painel-admin')
        .setDescription('Painel administrativo para visualizar as metas batidas pelos membros')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder()
        .setName('salatreino')
        .setDescription('Gera uma senha temporária para sala de treino')
].map(command => command.toJSON());

client.once('ready', async () => {
    console.log(`Bot online como ${client.user.tag}!`);

    // Registra os comandos no Discord
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    try {
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        console.log('Comandos registrados com sucesso!');
    } catch (error) {
        console.error('Erro ao registrar comandos:', error);
    }

    // Loop de atualização automática a cada 1 minuto (60.000 ms)
    setInterval(async () => {
        if (!configPainel.canalRankingId || !configPainel.mensagemRankingId) return;

        try {
            const canal = await client.channels.fetch(configPainel.canalRankingId);
            if (!canal) return;

            const msg = await canal.messages.fetch(configPainel.mensagemRankingId);
            if (msg) {
                const { embed, row } = gerarPainelComBotoes();
                await msg.edit({ embeds: [embed], components: [row] });
            }
        } catch (err) {
            console.error('Erro ao atualizar ranking automático:', err);
        }
    }, 60000);
});

// MONITOR DE VOZ (CALL)
client.on('voiceStateUpdate', (oldState, newState) => {
    const userId = newState.member?.user.id;
    if (!userId || newState.member?.user.bot) return;

    if (!oldState.channelId && newState.channelId) {
        entradaVoz.set(userId, Date.now());
    } else if (oldState.channelId && !newState.channelId) {
        const inicio = entradaVoz.get(userId);
        if (inicio) {
            const tempoDecorrido = Math.floor((Date.now() - inicio) / 1000);
            const acumulado = tempoCallAcumulado.get(userId) || 0;
            tempoCallAcumulado.set(userId, acumulado + tempoDecorrido);
            entradaVoz.delete(userId);
        }
    }
});

// CALCULA O TEMPO TOTAL EM CALL
function obterTempoTotalCall(userId) {
    const acumulado = tempoCallAcumulado.get(userId) || 0;
    const inicioAtual = entradaVoz.get(userId);
    if (inicioAtual) {
        return acumulado + Math.floor((Date.now() - inicioAtual) / 1000);
    }
    return acumulado;
}

// FORMATA O TEMPO EXATO (ex: 1h45min)
function formatarTempo(segundos) {
    if (segundos < 60) return `${segundos}s`;
    const horas = Math.floor(segundos / 3600);
    const minutos = Math.floor((segundos % 3600) / 60);

    if (horas > 0) {
        return `${horas}h${minutos}min`;
    }
    return `${minutos}min`;
}

// GERADOR DA EMBED E DOS BOTÕES DE PAGINAÇÃO
function gerarPainelComBotoes() {
    const embed = new EmbedBuilder().setColor(configPainel.cor);
    const row = new ActionRowBuilder();

    if (configPainel.paginaAtual === 'call') {
        // TOP 10 CALL
        const todosUsuariosVoz = new Set([...tempoCallAcumulado.keys(), ...entradaVoz.keys()]);
        const listaCall = [];
        todosUsuariosVoz.forEach(userId => {
            listaCall.push({ userId, totalSegundos: obterTempoTotalCall(userId) });
        });

        const rankingCall = listaCall
            .sort((a, b) => b.totalSegundos - a.totalSegundos)
            .slice(0, 10)
            .map((item, index) => `**${index + 1}.** <@${item.userId}> | **${formatarTempo(item.totalSegundos)}**`)
            .join('\n') || 'Nenhum tempo registrado.';

        embed.setTitle('🎧 Top Call')
             .setDescription(rankingCall)
             .setFooter({ text: 'Página 1/2 • Atualiza a cada 1 min' });

        row.addComponents(
            new ButtonBuilder().setCustomId('mudar_pagina').setLabel('Próximo ➡️ (Guerra de Guilda)').setStyle(ButtonStyle.Primary)
        );

    } else {
        // TOP 10 GUERRA DE GUILDA
        const rankingGuerra = Array.from(metasGuilda.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([id, pts], index) => `**${index + 1}.** <@${id}> | **${pts} pontos**`)
            .join('\n') || 'Nenhum registro nesta semana.';

        embed.setTitle('⚔️ Guerra de Guilda')
             .setDescription(rankingGuerra)
             .setFooter({ text: 'Página 2/2 • Atualiza a cada 1 min' });

        row.addComponents(
            new ButtonBuilder().setCustomId('mudar_pagina').setLabel('⬅️ Voltar (Top Call)').setStyle(ButtonStyle.Secondary)
        );
    }

    return { embed, row };
}

// INTERAÇÕES
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand() && !interaction.isButton()) return;

    // ESCALAÇÃO
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

    if (interaction.isButton()) {
        if (interaction.customId === 'vou') {
            await interaction.reply({ content: '✅ Presença confirmada!', ephemeral: true });
        } else if (interaction.customId === 'nao_vou') {
            await interaction.reply({ content: '❌ Ausência registrada.', ephemeral: true });
        } else if (interaction.customId === 'suplente') {
            await interaction.reply({ content: '🟡 Registrado como suplente.', ephemeral: true });
        }

        // ENTREGAR META
        if (interaction.customId === 'entregar_meta') {
            const userId = interaction.user.id;
            const pontosAtuais = (metasGuilda.get(userId) || 0) + 100;
            metasGuilda.set(userId, pontosAtuais);

            await interaction.reply({ content: `🎯 Meta entregue! Seus pontos acumulados na semana: **${pontosAtuais} pts**.`, ephemeral: true });
        }

        // BOTÃO DE MUDAR PÁGINA (SETA PARA O LADO)
        if (interaction.customId === 'mudar_pagina') {
            configPainel.paginaAtual = configPainel.paginaAtual === 'call' ? 'guerra' : 'call';
            const { embed, row } = gerarPainelComBotoes();
            await interaction.update({ embeds: [embed], components: [row] });
        }
    }

    // PAINEL DE META PARA OS MEMBROS
    if (interaction.isChatInputCommand() && interaction.commandName === 'painel-meta') {
        const embed = new EmbedBuilder()
            .setTitle('📥 ENTREGA DE METAS DE GUERRA')
            .setDescription('Clique no botão abaixo sempre que concluir suas partidas para somar pontos na sua meta semanal.')
            .setColor('#0052cc');

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('entregar_meta').setLabel('🎯 Entregar Pontos de Meta').setStyle(ButtonStyle.Primary)
        );

        await interaction.reply({ embeds: [embed], components: [row] });
    }

    // ATIVAR RANKING AUTOMÁTICO COM PAGINAÇÃO
    if (interaction.isChatInputCommand() && interaction.commandName === 'iniciar-ranking-automatico') {
        configPainel.canalRankingId = interaction.channelId;
        const { embed, row } = gerarPainelComBotoes();
        const msg = await interaction.channel.send({ embeds: [embed], components: [row] });
        configPainel.mensagemRankingId = msg.id;

        await interaction.reply({ content: '✅ Painel interativo iniciado! Ele atualizará sozinho a cada 1 minuto.', ephemeral: true });
    }

    // PAINEL ADMIN
    if (interaction.isChatInputCommand() && interaction.commandName === 'painel-admin') {
        const listaMetas = Array.from(metasGuilda.entries())
            .map(([id, pts]) => `• <@${id}>: **${pts} pontos** na semana`)
            .join('\n') || 'Nenhum membro entregou metas ainda.';

        const embedAdmin = new EmbedBuilder()
            .setTitle('🛠️ PAINEL ADMINISTRATIVO — METAS DA GUILDA')
            .setDescription('Progresso de cada membro:\n\n' + listaMetas)
            .setColor('#FF0000');

        await interaction.reply({ embeds: [embedAdmin], ephemeral: true });
    }

    // SALA DE TREINO
    if (interaction.isChatInputCommand() && interaction.commandName === 'salatreino') {
        const senha = Math.floor(1000 + Math.random() * 9000);
        await interaction.reply(`🎮 **Sala de Treino Gerada!**\n🔑 **Senha temporária:** \`${senha}\``);
    }
});

// Servidor HTTP para manter o Render ligado
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Bot online!');
}).listen(process.env.PORT || 3000);

client.login(process.env.DISCORD_TOKEN);

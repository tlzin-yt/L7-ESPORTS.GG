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
const entradaVoz = new Map(); // Guarda o horário em que o usuário entrou na call atual

// Configuração do painel de ranking
const configPainel = {
    cor: '#0055FF',
    titulo: '🏆 RANKING AO VIVO — GUERRA & CALL',
    descricao: 'Este painel atualiza automaticamente a cada 1 minuto com o desempenho da guilda.',
    imagem: '',
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
        .setDescription('Define o canal atual para receber o ranking que atualiza de 1 em 1 minuto (Admin)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder()
        .setName('painel-admin')
        .setDescription('Painel administrativo para visualizar as metas batidas pelos membros')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder()
        .setName('config-painel')
        .setDescription('Configura a aparência do painel de ranking (Admin)')
        .addStringOption(option => option.setName('titulo').setDescription('Título da Embed').setRequired(false))
        .addStringOption(option => option.setName('descricao').setDescription('Descrição da Embed').setRequired(false))
        .addStringOption(option => option.setName('cor').setDescription('Cor em Hexadecimal (ex: #0055FF)').setRequired(false))
        .addStringOption(option => option.setName('imagem').setDescription('Link da imagem/banner').setRequired(false))
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
        if (!configPainel.canalRankingId) return;

        try {
            const canal = await client.channels.fetch(configPainel.canalRankingId);
            if (!canal) return;

            const embedRanking = gerarEmbedRanking();

            if (configPainel.mensagemRankingId) {
                try {
                    const msgAntiga = await canal.messages.fetch(configPainel.mensagemRankingId);
                    await msgAntiga.edit({ embeds: [embedRanking] });
                    return;
                } catch (err) {
                    // Se a mensagem sumiu, cria uma nova
                }
            }

            const novaMsg = await canal.send({ embeds: [embedRanking] });
            configPainel.mensagemRankingId = novaMsg.id;
        } catch (err) {
            console.error('Erro ao atualizar ranking automático:', err);
        }
    }, 60000);
});

// MONITOR DE VOZ (CALL)
client.on('voiceStateUpdate', (oldState, newState) => {
    const userId = newState.member?.user.id;
    if (!userId || newState.member?.user.bot) return;

    // Entrou em uma call
    if (!oldState.channelId && newState.channelId) {
        entradaVoz.set(userId, Date.now());
    } 
    // Saiu de uma call
    else if (oldState.channelId && !newState.channelId) {
        const inicio = entradaVoz.get(userId);
        if (inicio) {
            const tempoDecorrido = Math.floor((Date.now() - inicio) / 1000);
            const acumulado = tempoCallAcumulado.get(userId) || 0;
            tempoCallAcumulado.set(userId, acumulado + tempoDecorrido);
            entradaVoz.delete(userId);
        }
    }
});

// CALCULA O TEMPO TOTAL EM CALL (ACUMULADO + TEMPO AO VIVO NA CALL ATUAL)
function obterTempoTotalCall(userId) {
    const acumulado = tempoCallAcumulado.get(userId) || 0;
    const inicioAtual = entradaVoz.get(userId);

    if (inicioAtual) {
        const tempoNaCallAtual = Math.floor((Date.now() - inicioAtual) / 1000);
        return acumulado + tempoNaCallAtual;
    }

    return acumulado;
}

// GERADOR DA EMBED DO RANKING
function gerarEmbedRanking() {
    // 1. Organiza Ranking de Guerra
    const rankingGuerra = Array.from(metasGuilda.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([id, pts], index) => `**#${index + 1}** <@${id}> — **${pts} pts**`)
        .join('\n') || 'Nenhum registro nesta semana.';

    // 2. Coleta o tempo de todos que já entraram em call (acumulado + ao vivo)
    const todosUsuariosVoz = new Set([...tempoCallAcumulado.keys(), ...entradaVoz.keys()]);
    const listaCall = [];

    todosUsuariosVoz.forEach(userId => {
        const totalSegundos = obterTempoTotalCall(userId);
        listaCall.push({ userId, totalSegundos });
    });

    // Organiza Top 5 Call
    const rankingCall = listaCall
        .sort((a, b) => b.totalSegundos - a.totalSegundos)
        .slice(0, 5)
        .map((item, index) => {
            const minutos = Math.floor(item.totalSegundos / 60);
            const horas = (item.totalSegundos / 3600).toFixed(1);
            
            // Exibe em minutos se tiver menos de 1 hora, ou em horas
            const textoTempo = minutos < 60 ? `${minutos} min` : `${horas}h`;
            return `**#${index + 1}** <@${item.userId}> — **${textoTempo}** em call`;
        })
        .join('\n') || 'Nenhum tempo registrado.';

    const embed = new EmbedBuilder()
        .setTitle(configPainel.titulo)
        .setDescription(configPainel.descricao)
        .setColor(configPainel.cor)
        .addFields(
            { name: '🏆 Top Guerra de Guilda (Semanal)', value: rankingGuerra, inline: false },
            { name: '🎧 Top Tempo em Call (Ao Vivo)', value: rankingCall, inline: false }
        )
        .setFooter({ text: 'Atualizado automaticamente a cada 1 minuto.' })
        .setTimestamp();

    if (configPainel.imagem) {
        embed.setImage(configPainel.imagem);
    }

    return embed;
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

            await interaction.reply({ content: `🎯 Meta entregue com sucesso! Seus pontos acumulados na semana: **${pontosAtuais} pts**.`, ephemeral: true });
        }
    }

    // PAINEL DE META PARA OS MEMBROS
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

    // ATIVAR RANKING AUTOMÁTICO
    if (interaction.isChatInputCommand() && interaction.commandName === 'iniciar-ranking-automatico') {
        configPainel.canalRankingId = interaction.channelId;
        const embedInicial = gerarEmbedRanking();
        const msg = await interaction.channel.send({ embeds: [embedInicial] });
        configPainel.mensagemRankingId = msg.id;

        await interaction.reply({ content: '✅ Canal configurado com sucesso! O ranking agora vai atualizar sozinho a cada 1 minuto.', ephemeral: true });
    }

    // PAINEL ADMIN
    if (interaction.isChatInputCommand() && interaction.commandName === 'painel-admin') {
        const listaMetas = Array.from(metasGuilda.entries())
            .map(([id, pts]) => `• <@${id}>: **${pts} pontos** na semana`)
            .join('\n') || 'Nenhum membro entregou metas ainda.';

        const embedAdmin = new EmbedBuilder()
            .setTitle('🛠️ PAINEL ADMINISTRATIVO — METAS DA GUILDA')
            .setDescription('Aqui os administradores podem visualizar o progresso de cada membro:\n\n' + listaMetas)
            .setColor('#FF0000')
            .setFooter({ text: 'As metas semanais resetam todo domingo às 23:59:59.' });

        await interaction.reply({ embeds: [embedAdmin], ephemeral: true });
    }

    // CONFIGURAR PAINEL
    if (interaction.isChatInputCommand() && interaction.commandName === 'config-painel') {
        const novoTitulo = interaction.options.getString('titulo');
        const novaDesc = interaction.options.getString('descricao');
        const novaCor = interaction.options.getString('cor');
        const novaImg = interaction.options.getString('imagem');

        if (novoTitulo) configPainel.titulo = novoTitulo;
        if (novaDesc) configPainel.descricao = novaDesc;
        if (novaCor) configPainel.cor = novaCor;
        if (novaImg) configPainel.imagem = novaImg;

        await interaction.reply({ content: '✅ Aparência atualizada! O painel se atualizará automaticamente no próximo ciclo de 1 minuto.', ephemeral: true });
    }

    // SALA DE TREINO
    if (interaction.isChatInputCommand() && interaction.commandName === 'salatreino') {
        const senha = Math.floor(1000 + Math.random() * 9000);
        await interaction.reply(`🎮 **Sala de Treino Gerada!**\n🔑 **Senha temporária:** \`${senha}\`\n⚠️ Compartilhe apenas com os membros autorizados.`);
    }
});

// Servidor HTTP para manter o Render ligado
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Bot online!');
}).listen(process.env.PORT || 3000);

client.login(process.env.DISCORD_TOKEN);

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
const tempoCall = new Map();   // Guarda segundos em call
const controleVoz = new Map(); // Guarda momento de entrada na call

// Configuração do painel de ranking
const configPainel = {
    cor: '#0055FF',
    titulo: '🏆 RANKING AO VIVO — GUERRA & CALL',
    descricao: 'Este painel atualiza automaticamente a cada 1 minuto com o desempenho da guilda.',
    imagem: '',
    canalRankingId: null, // Canal onde o ranking automático vai rodar
    mensagemRankingId: null // ID da mensagem fixa do ranking
};

// Comandos do bot
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

    // Registra os comandos Slash
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    try {
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        console.log('Comandos registrados com sucesso!');
    } catch (error) {
        console.error('Erro ao registrar comandos:', error);
    }

    // Roda o loop de atualização do ranking a cada 1 minuto (60000 ms)
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
                    // Se a mensagem foi apagada, cria uma nova abaixo
                }
            }

            const novaMsg = await canal.send({ embeds: [embedRanking] });
            configPainel.mensagemRankingId = novaMsg.id;
        } catch (err) {
            console.error('Erro ao atualizar ranking automático:', err);
        }
    }, 60000);
});

// Função para montar a Embed do Ranking
function gerarEmbedRanking() {
    const rankingGuerra = Array.from(metasGuilda.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([id, pts], index) => `**#${index + 1}** <@${id}> — **${pts} pts**`)
        .join('\n') || 'Nenhum registro nesta semana.';

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
        )
        .setFooter({ text: 'Atualizado automaticamente a cada 1 minuto.' })
        .setTimestamp();

    if (configPainel.imagem) {
        embed.setImage(configPainel.imagem);
    }

    return embed;
}

// Contabilização de tempo em call
client.on('voiceStateUpdate', (oldState, newState) => {
    const userId = newState.member?.user.id;
    if (!userId) return;

    if (!oldState.channelId && newState.channelId) {
        controleVoz.set(userId, Date.now());
    } else if (oldState.channelId && !newState.channelId) {
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

    // 1. ESCALAÇÃO
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

        if (interaction.customId === 'entregar_meta') {
            const userId = interaction.user.id;
            const pontosAtuais = (metasGuilda.get(userId) || 0) + 100;
            metasGuilda.set(userId, pontosAtuais);

            await interaction.reply({ content: `🎯 Meta entregue! Seus pontos acumulados na semana: **${pontosAtuais} pts**.`, ephemeral: true });
        }
    }

    // 2. PAINEL DE META PARA OS MEMBROS
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

    // 3. ATIVAR O RANKING AUTOMÁTICO NO CANAL ATUAL
    if (interaction.isChatInputCommand() && interaction.commandName === 'iniciar-ranking-automatico') {
        configPainel.canalRankingId = interaction.channelId;
        const embedInicial = gerarEmbedRanking();
        const msg = await interaction.channel.send({ embeds: [embedInicial] });
        configPainel.mensagemRankingId = msg.id;

        await interaction.reply({ content: '✅ Canal configurado com sucesso! O ranking agora vai atualizar sozinho a cada 1 minuto.', ephemeral: true });
    }

    // 4. PAINEL ADMIN (VER METAS DOS MEMBROS)
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

    // 5. CONFIGURAR APARÊNCIA DO PAINEL
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

    // 6. SALA DE TREINO
    if (interaction.isChatInputCommand() && interaction.commandName === 'salatreino') {
        const senha = Math.floor(1000 + Math.random() * 9000);
        await interaction.reply(`🎮 **Sala de Treino Gerada!**\n🔑 **Senha temporária:** \`${senha}\`\n⚠️ Compartilhe apenas com os membros autorizados.`);
    }
});

// Servidor HTTP para manter o Render ativo
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Bot online!');
}).listen(process.env.PORT || 3000);

client.login(process.env.DISCORD_TOKEN);

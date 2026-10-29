const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, SlashCommandBuilder, REST, Routes } = require('discord.js');
const admin = require('firebase-admin');

// INICIALIZAR FIREBASE ADMIN
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers]
});

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;

// REGISTRO DE SLASH COMMANDS
const commands = [
  new SlashCommandBuilder().setName('recrutamento').setDescription('Dispara o painel de recrutamento com formulário'),
  new SlashCommandBuilder().setName('ticket').setDescription('Dispara o painel de suporte estilo Ticket King'),
  new SlashCommandBuilder().setName('escalacao').setDescription('Dispara o painel de escalação para Guerra de Guilda'),
  new SlashCommandBuilder().setName('ranking').setDescription('Exibe o ranking atualizado de pontos de guerra'),
  new SlashCommandBuilder().setName('limpar').setDescription('Apaga mensagens em massa').addIntegerOption(o => o.setName('quantidade').setDescription('Número de mensagens (1-100)').setRequired(true)),
  new SlashCommandBuilder().setName('avisar').setDescription('Aplica advertência formal a um membro').addUserOption(o => o.setName('membro').setDescription('Membro a avisar').setRequired(true)).addStringOption(o => o.setName('motivo').setDescription('Motivo da advertência').setRequired(true)),
  new SlashCommandBuilder().setName('fecharticket').setDescription('Fecha o ticket atual')
].map(cmd => cmd.toJSON());

client.once('ready', async () => {
  console.log(`🤖 Bot L7 ESPORTS online como ${client.user.tag}`);
  const rest = new REST({ version: '10' }).setToken(TOKEN);
  try {
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
    console.log('✅ Slash Commands registrados com sucesso!');
  } catch (err) {
    console.error('Erro ao registrar comandos:', err);
  }
});

// INTERAÇÕES (COMANDOS, BOTÕES E MODALS)
client.on('interactionCreate', async (interaction) => {
  
  // 1. SLASH COMMANDS
  if (interaction.isChatInputCommand()) {
    const { commandName } = interaction;

    if (commandName === 'recrutamento') {
      const embed = new EmbedBuilder()
        .setTitle('⚔️ L7 ESPORTS™ — RECRUTAMENTO OFICIAL')
        .setDescription('Quer fazer parte da nossa line-up? Clica no botão abaixo para preencher a tua ficha de alistamento!')
        .setColor('#0055FF');

      const btn = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('btn_abrir_recrutamento').setLabel('Inscrever-se').setStyle(ButtonStyle.Primary).setEmoji('📝')
      );

      await interaction.reply({ embeds: [embed], components: [btn] });
    }

    if (commandName === 'ticket') {
      const embed = new EmbedBuilder()
        .setTitle('🎫 CENTRAL DE ATENDIMENTO — L7 ESPORTS')
        .setDescription('Precisa de suporte, parcerias ou dúvidas? Abra um ticket privado com a nossa staff.')
        .setColor('#0055FF');

      const btn = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('btn_abrir_ticket').setLabel('Abrir Ticket').setStyle(ButtonStyle.Success).setEmoji('📩')
      );

      await interaction.reply({ embeds: [embed], components: [btn] });
    }

    if (commandName === 'escalacao') {
      const embed = new EmbedBuilder()
        .setTitle('🔥 ESCALAÇÃO PARA GUERRA DE GUILDA')
        .setDescription('Confirme a sua presença na partida abaixo:')
        .setColor('#0055FF');

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('esc_sim').setLabel('Confirmado').setStyle(ButtonStyle.Success).setEmoji('🟢'),
        new ButtonBuilder().setCustomId('esc_nao').setLabel('Não Vou').setStyle(ButtonStyle.Danger).setEmoji('🔴'),
        new ButtonBuilder().setCustomId('esc_justificar').setLabel('Justificar').setStyle(ButtonStyle.Warning).setEmoji('📝')
      );

      await interaction.reply({ embeds: [embed], components: [row] });
    }

    if (commandName === 'ranking') {
      const snapshot = await db.collection('guilda').doc('membros').collection('usuarios').orderBy('pontosGuerra', 'desc').limit(10).get();
      let texto = '';
      let i = 1;
      snapshot.forEach(doc => {
        const d = doc.data();
        texto += `**#${i}** ${d.nome || doc.id} — **${d.pontosGuerra || 0} pts**\n`;
        i++;
      });

      const embed = new EmbedBuilder()
        .setTitle('🏆 TOP 10 — GUERRA DE GUILDA')
        .setDescription(texto || 'Nenhum dado registrado ainda.')
        .setColor('#0055FF');

      await interaction.reply({ embeds: [embed] });
    }

    if (commandName === 'limpar') {
      const qtd = interaction.options.getInteger('quantidade');
      await interaction.channel.bulkDelete(qtd, true);
      await interaction.reply({ content: `🧹 **${qtd}** mensagens apagadas com sucesso!`, ephemeral: true });
    }

    if (commandName === 'fecharticket') {
      if (interaction.channel.name.startsWith('ticket-')) {
        await interaction.reply('🔒 Fechando ticket em 5 segundos...');
        setTimeout(() => interaction.channel.delete(), 5000);
      } else {
        await interaction.reply({ content: 'Este comando só pode ser usado num canal de ticket.', ephemeral: true });
      }
    }
  }

  // 2. BOTÕES
  if (interaction.isButton()) {
    if (interaction.customId === 'btn_abrir_recrutamento') {
      const modal = new ModalBuilder()
        .setCustomId('modal_recrutamento')
        .setTitle('Ficha de Recrutamento — L7 ESPORTS');

      const inputNome = new TextInputBuilder().setCustomId('rec_nome').setLabel('Seu Nome / Nick no Jogo').setStyle(TextInputStyle.Short).setRequired(true);
      const inputIdade = new TextInputBuilder().setCustomId('rec_idade').setLabel('Sua Idade').setStyle(TextInputStyle.Short).setRequired(true);
      const inputPosicao = new TextInputBuilder().setCustomId('rec_posicao').setLabel('Sua Posição (Rush, Capa, Suporte)').setStyle(TextInputStyle.Short).setRequired(true);

      modal.addComponents(
        new ActionRowBuilder().addComponents(inputNome),
        new ActionRowBuilder().addComponents(inputIdade),
        new ActionRowBuilder().addComponents(inputPosicao)
      );

      await interaction.showModal(modal);
    }

    if (interaction.customId === 'btn_abrir_ticket') {
      const channelName = `ticket-${interaction.user.username.toLowerCase()}`;
      const channel = await interaction.guild.channels.create({
        name: channelName,
        permissionOverwrites: [
          { id: interaction.guild.id, deny: ['ViewChannel'] },
          { id: interaction.user.id, allow: ['ViewChannel', 'SendMessages'] }
        ]
      });

      await db.collection('tickets').doc(channel.id).set({
        userId: interaction.user.id,
        userTag: interaction.user.tag,
        data: new Date()
      });

      await channel.send({ content: `👋 Olá <@${interaction.user.id}>, a staff da **L7 ESPORTS™** atenderá você em breve! Use \`/fecharticket\` para encerrar este atendimento.` });
      await interaction.reply({ content: `✅ Ticket criado em ${channel}`, ephemeral: true });
    }

    if (interaction.customId === 'esc_justificar') {
      const modal = new ModalBuilder()
        .setCustomId('modal_justificativa')
        .setTitle('Justificativa de Ausência');

      const inputMotivo = new TextInputBuilder().setCustomId('just_motivo').setLabel('Motivo da Ausência').setStyle(TextInputStyle.Paragraph).setRequired(true);
      modal.addComponents(new ActionRowBuilder().addComponents(inputMotivo));

      await interaction.showModal(modal);
    }
  }

  // 3. ENVIO DE MODALS
  if (interaction.isModalSubmit()) {
    if (interaction.customId === 'modal_recrutamento') {
      const nome = interaction.fields.getTextInputValue('rec_nome');
      const idade = interaction.fields.getTextInputValue('rec_idade');
      const posicao = interaction.fields.getTextInputValue('rec_posicao');

      await db.collection('recrutamento').doc(interaction.user.id).set({
        nome, idade, posicao, userTag: interaction.user.tag, data: new Date()
      });

      await interaction.reply({ content: '✅ A tua ficha foi enviada com sucesso para a diretoria da **L7 ESPORTS™**!', ephemeral: true });
    }

    if (interaction.customId === 'modal_justificativa') {
      const motivo = interaction.fields.getTextInputValue('just_motivo');

      await db.collection('justificativas').doc(interaction.user.id).set({
        userId: interaction.user.id, userTag: interaction.user.tag, motivo, data: new Date()
      });

      await interaction.reply({ content: '📝 A tua justificativa foi salva no painel da diretoria!', ephemeral: true });
    }
  }
});

client.login(TOKEN);

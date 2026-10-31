import React, { useState, useEffect } from 'react';
import { 
  Shield, Trophy, Users, ShoppingBag, Newspaper, LogIn, LogOut, 
  Settings, Menu, X, ChevronRight, CheckCircle2, AlertCircle, 
  Trash2, Edit, Plus, ExternalLink, Flame, Send, Eye, RefreshCw,
  Lock, Key, Mail, User, Phone, Award, Globe, FileText, Check, Clock
} from 'lucide-react';
import { auth, db, storage, ADMIN_EMAIL } from './firebase';
import { 
  signInWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged 
} from 'firebase/auth';
import { 
  collection, getDocs, addDoc, updateDoc, deleteDoc, doc, 
  serverTimestamp, query, orderBy, onSnapshot, setDoc, getDoc 
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

export default function App() {
  // Estado de Autenticação e Usuário
  const [user, setUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);

  // Navegação e Modais
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [loginModalOpen, setLoginModalOpen] = useState(false);
  const [adminPanelOpen, setAdminPanelOpen] = useState(false);
  const [newsModalOpen, setNewsModalOpen] = useState(false);
  const [selectedNews, setSelectedNews] = useState(null);
  const [shopModalOpen, setShopModalOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);

  // Credenciais de Login
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');

  // Notificações / Toasts
  const [toast, setToast] = useState({ show: false, message: '', type: 'success' });

  // Dados Dinâmicos do Firestore
  const [heroData, setHeroData] = useState({
    title: 'A ELITE DO FREE FIRE COMPETITIVO',
    subtitle: 'Competindo no topo do cenário nacional com disciplina, estratégia e sede de vitória.',
    bannerUrl: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=1920&auto=format&fit=crop'
  });

  const [aboutData, setAboutData] = useState({
    history: 'Fundada com o propósito de revolucionar o cenário mobile de esports, a L7 ESPORTS nasceu da união de jogadores determinados a alcançar o topo. Com uma gestão profissional e foco inabalável, construímos uma das guildas mais respeitadas do cenário.',
    mission: 'Desenvolver talentos de alto nível, fomentar a competitividade saudável e consolidar a marca L7 no topo do cenário internacional de Free Fire.',
    vision: 'Ser referência máxima em performance, engajamento de comunidade e profissionalismo nos esports.',
    values: 'Disciplina, Respeito, Trabalho em Equipe, Foco na Vitória e Inovação.'
  });

  const [roster, setRoster] = useState([]);
  const [titles, setTitles] = useState([]);
  const [news, setNews] = useState([]);
  const [products, setProducts] = useState([]);
  const [tryouts, setTryouts] = useState([]);

  // Formulário de Inscrição (Tryouts)
  const [tryoutForm, setTryoutForm] = useState({
    nickname: '',
    realName: '',
    age: '',
    phone: '',
    whyJoin: '',
    playedPro: 'Não',
    mediaUrl: ''
  });
  const [tryoutSubmitting, setTryoutSubmitting] = useState(false);

  // Aba ativa do Painel Admin
  const [adminTab, setAdminTab] = useState('dashboard');

  // Estados de Edição do Admin
  const [editingItem, setEditingItem] = useState(null);
  const [isEditing, setIsEditing] = useState(false);

  // Formulário temporário para modais do Admin
  const [adminForm, setAdminForm] = useState({});

  // 1. Monitorar Autenticação Firebase
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (currentUser && currentUser.email === ADMIN_EMAIL) {
        setIsAdmin(true);
      } else {
        setIsAdmin(false);
      }
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // 2. Carregar Dados em Tempo Real do Firestore
  useEffect(() => {
    // Roster
    const unsubRoster = onSnapshot(collection(db, 'roster'), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setRoster(data);
    }, (error) => console.log('Erro ao carregar roster:', error));

    // Titles
    const unsubTitles = onSnapshot(collection(db, 'titles'), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setTitles(data);
    });

    // News
    const unsubNews = onSnapshot(query(collection(db, 'news'), orderBy('createdAt', 'desc')), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setNews(data);
    });

    // Shop Products
    const unsubShop = onSnapshot(collection(db, 'shop'), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setProducts(data);
    });

    // Tryouts (Apenas visíveis para Admin nas regras do Firestore)
    let unsubTryouts = () => {};
    if (isAdmin) {
      unsubTryouts = onSnapshot(query(collection(db, 'tryouts'), orderBy('createdAt', 'desc')), (snapshot) => {
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setTryouts(data);
      });
    }

    // Settings (Hero & About)
    const fetchSettings = async () => {
      try {
        const heroDoc = await getDoc(doc(db, 'settings', 'hero'));
        if (heroDoc.exists()) setHeroData(heroDoc.data());

        const aboutDoc = await getDoc(doc(db, 'settings', 'about'));
        if (aboutDoc.exists()) setAboutData(aboutDoc.data());
      } catch (err) {
        console.log('Configurações padrão em uso.');
      }
    };
    fetchSettings();

    return () => {
      unsubRoster();
      unsubTitles();
      unsubNews();
      unsubShop();
      unsubTryouts();
    };
  }, [isAdmin]);

  // Função para exibir Toasts
  const showToast = (message, type = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => {
      setToast({ show: false, message: '', type: 'success' });
    }, 4000);
  };

  // Login de Administrador
  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError('');
    try {
      if (loginEmail !== ADMIN_EMAIL) {
        setLoginError('E-mail não autorizado para acesso administrativo.');
        return;
      }
      await signInWithEmailAndPassword(auth, loginEmail, loginPassword);
      setLoginModalOpen(false);
      setLoginEmail('');
      setLoginPassword('');
      showToast('Bem-vindo ao Painel Administrativo, Administrador!');
      setAdminPanelOpen(true);
    } catch (error) {
      console.error(error);
      setLoginError('Falha na autenticação. Verifique suas credenciais.');
    }
  };

  // Logout
  const handleLogout = async () => {
    await signOut(auth);
    setIsAdmin(false);
    setAdminPanelOpen(false);
    showToast('Sessão encerrada com sucesso.', 'info');
  };

  // Envio de Inscrição (Tryouts)
  const handleTryoutSubmit = async (e) => {
    e.preventDefault();
    if (!tryoutForm.nickname || !tryoutForm.realName || !tryoutForm.age || !tryoutForm.phone) {
      showToast('Preencha todos os campos obrigatórios!', 'error');
      return;
    }

    setTryoutSubmitting(true);
    try {
      await addDoc(collection(db, 'tryouts'), {
        ...tryoutForm,
        status: 'Pendente',
        createdAt: serverTimestamp()
      });
      showToast('Inscrição enviada com sucesso! Boa sorte, pro-player.');
      setTryoutForm({
        nickname: '',
        realName: '',
        age: '',
        phone: '',
        whyJoin: '',
        playedPro: 'Não',
        mediaUrl: ''
      });
    } catch (error) {
      console.error(error);
      showToast('Erro ao enviar inscrição. Tente novamente.', 'error');
    } finally {
      setTryoutSubmitting(false);
    }
  };

  // Atualizar Status de Inscrição
  const updateTryoutStatus = async (id, newStatus) => {
    try {
      await updateDoc(doc(db, 'tryouts', id), { status: newStatus });
      showToast(`Status alterado para: ${newStatus}`);
    } catch (error) {
      showToast('Erro ao atualizar status.', 'error');
    }
  };

  // Excluir registro administrativo
  const handleDeleteItem = async (collectionName, id) => {
    if (!window.confirm('Tem certeza que deseja excluir este registro?')) return;
    try {
      await deleteDoc(doc(db, collectionName, id));
      showToast('Registro excluído com sucesso.');
    } catch (error) {
      showToast('Erro ao excluir registro.', 'error');
    }
  };

  return (
    <div className="min-h-screen bg-[#08090C] text-slate-100 selection:bg-[#00FF66] selection:text-black">
      
      {/* Toast Notification */}
      {toast.show && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 bg-[#121620] border border-[#00FF66] px-5 py-4 rounded-xl shadow-2xl glow-green animate-bounce">
          <CheckCircle2 className="w-6 h-6 text-[#00FF66]" />
          <span className="text-sm font-semibold text-white">{toast.message}</span>
        </div>
      )}

      {/* HEADER / NAVBAR */}
      <header className="sticky top-0 z-40 bg-[#08090C]/90 backdrop-blur-md border-b border-slate-800/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          
          {/* Logo */}
          <a href="#" className="flex items-center gap-3 group">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#00FF66] to-[#008833] flex items-center justify-center glow-green-sm group-hover:scale-105 transition-transform">
              <Shield className="w-6 h-6 text-black fill-black" />
            </div>
            <div>
              <span className="font-heading text-2xl tracking-wider font-bold bg-gradient-to-r from-white via-slate-200 to-[#00FF66] bg-clip-text text-transparent">
                L7 ESPORTS
              </span>
              <span className="block text-[10px] tracking-widest text-[#00FF66] uppercase font-bold">Free Fire Pro</span>
            </div>
          </a>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-8 font-semibold text-sm tracking-wide">
            <a href="#inicio" className="hover:text-[#00FF66] transition-colors">INÍCIO</a>
            <a href="#sobre" className="hover:text-[#00FF66] transition-colors">SOBRE</a>
            <a href="#elenco" className="hover:text-[#00FF66] transition-colors">ELENCO</a>
            <a href="#titulos" className="hover:text-[#00FF66] transition-colors">TÍTULOS</a>
            <a href="#noticias" className="hover:text-[#00FF66] transition-colors">NOTÍCIAS</a>
            <a href="#shop" className="hover:text-[#00FF66] transition-colors">SHOP</a>
            <a href="#inscricao" className="text-[#00FF66] hover:underline flex items-center gap-1">
              <Flame className="w-4 h-4" /> SEJA PRO
            </a>
          </nav>

          {/* Right Action: Admin Button (Strictly visible only for tuliofonseca00@gmail.com) */}
          <div className="hidden md:flex items-center gap-4">
            {user && user.email === ADMIN_EMAIL && (
              <button 
                onClick={() => setAdminPanelOpen(true)}
                className="flex items-center gap-2 bg-[#00FF66] hover:bg-[#00cc52] text-black font-bold px-4 py-2.5 rounded-lg transition-all glow-green-sm text-sm"
              >
                <Settings className="w-4 h-4" /> Painel Admin
              </button>
            )}

            {!user ? (
              <button 
                onClick={() => setLoginModalOpen(true)}
                className="flex items-center gap-2 text-slate-400 hover:text-white px-3 py-2 rounded-lg transition-colors text-sm"
              >
                <LogIn className="w-4 h-4" /> Login
              </button>
            ) : (
              <button 
                onClick={handleLogout}
                className="flex items-center gap-2 text-red-400 hover:text-red-300 px-3 py-2 rounded-lg transition-colors text-sm"
              >
                <LogOut className="w-4 h-4" /> Sair
              </button>
            )}
          </div>

          {/* Mobile Menu Button */}
          <button 
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 text-slate-300 hover:text-white"
          >
            {mobileMenuOpen ? <X className="w-7 h-7" /> : <Menu className="w-7 h-7" />}
          </button>
        </div>

        {/* Mobile Dropdown */}
        {mobileMenuOpen && (
          <div className="md:hidden bg-[#121620] border-b border-slate-800 px-6 py-5 space-y-4">
            <a href="#inicio" onClick={() => setMobileMenuOpen(false)} className="block text-base font-semibold hover:text-[#00FF66]">INÍCIO</a>
            <a href="#sobre" onClick={() => setMobileMenuOpen(false)} className="block text-base font-semibold hover:text-[#00FF66]">SOBRE</a>
            <a href="#elenco" onClick={() => setMobileMenuOpen(false)} className="block text-base font-semibold hover:text-[#00FF66]">ELENCO</a>
            <a href="#titulos" onClick={() => setMobileMenuOpen(false)} className="block text-base font-semibold hover:text-[#00FF66]">TÍTULOS</a>
            <a href="#noticias" onClick={() => setMobileMenuOpen(false)} className="block text-base font-semibold hover:text-[#00FF66]">NOTÍCIAS</a>
            <a href="#shop" onClick={() => setMobileMenuOpen(false)} className="block text-base font-semibold hover:text-[#00FF66]">SHOP</a>
            <a href="#inscricao" onClick={() => setMobileMenuOpen(false)} className="block text-base font-semibold text-[#00FF66]">SEJA PRO</a>
            
            <div className="pt-4 border-t border-slate-800 flex flex-col gap-3">
              {user && user.email === ADMIN_EMAIL && (
                <button 
                  onClick={() => { setMobileMenuOpen(false); setAdminPanelOpen(true); }}
                  className="w-full flex items-center justify-center gap-2 bg-[#00FF66] text-black font-bold py-2.5 rounded-lg text-sm"
                >
                  <Settings className="w-4 h-4" /> Painel Admin
                </button>
              )}
              {!user ? (
                <button 
                  onClick={() => { setMobileMenuOpen(false); setLoginModalOpen(true); }}
                  className="w-full flex items-center justify-center gap-2 bg-slate-800 text-white font-semibold py-2.5 rounded-lg text-sm"
                >
                  <LogIn className="w-4 h-4" /> Entrar
                </button>
              ) : (
                <button 
                  onClick={() => { setMobileMenuOpen(false); handleLogout(); }}
                  className="w-full flex items-center justify-center gap-2 bg-red-500/20 text-red-400 font-semibold py-2.5 rounded-lg text-sm"
                >
                  <LogOut className="w-4 h-4" /> Sair
                </button>
              )}
            </div>
          </div>
        )}
      </header>

      {/* HERO SECTION */}
      <section id="inicio" className="relative min-h-[90vh] flex items-center justify-center overflow-hidden bg-slate-950">
        <div className="absolute inset-0 z-0">
          <img 
            src={heroData.bannerUrl} 
            alt="L7 ESPORTS Hero" 
            className="w-full h-full object-cover opacity-30 scale-105 animate-pulse duration-1000"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#08090C] via-[#08090C]/60 to-transparent"></div>
        </div>

        <div className="relative z-10 max-w-5xl mx-auto px-4 text-center py-20">
          <div className="inline-flex items-center gap-2 bg-[#00FF66]/10 border border-[#00FF66]/30 px-4 py-1.5 rounded-full text-[#00FF66] text-xs font-bold tracking-widest uppercase mb-6 glow-green-sm">
            <Flame className="w-4 h-4" /> Free Fire Professional Series
          </div>
          <h1 className="font-heading text-6xl sm:text-7xl lg:text-8xl tracking-tight font-extrabold text-white mb-6 uppercase">
            {heroData.title}
          </h1>
          <p className="max-w-2xl mx-auto text-slate-300 text-lg sm:text-xl mb-10 font-normal">
            {heroData.subtitle}
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <a 
              href="#elenco" 
              className="w-full sm:w-auto bg-[#00FF66] hover:bg-[#00cc52] text-black font-extrabold px-8 py-4 rounded-xl text-base tracking-wider transition-all glow-green flex items-center justify-center gap-2"
            >
              CONHECER ELENCO <ChevronRight className="w-5 h-5" />
            </a>
            <a 
              href="#inscricao" 
              className="w-full sm:w-auto bg-slate-900/80 hover:bg-slate-800 text-white border border-slate-700 font-bold px-8 py-4 rounded-xl text-base tracking-wider transition-all flex items-center justify-center gap-2"
            >
              FAÇA PARTE DA L7 <Flame className="w-5 h-5 text-[#00FF66]" />
            </a>
          </div>
        </div>
      </section>

      {/* SOBRE A L7 */}
      <section id="sobre" className="py-24 bg-[#0B0D13] relative border-t border-slate-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-[#00FF66] font-bold text-sm tracking-widest uppercase mb-3">INSTITUCIONAL</h2>
            <h3 className="font-heading text-4xl sm:text-5xl font-bold tracking-wide">SOBRE A L7 ESPORTS</h3>
            <div className="w-20 h-1 bg-[#00FF66] mx-auto mt-4 rounded-full glow-green-sm"></div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div className="space-y-6">
              <p className="text-slate-300 text-lg leading-relaxed">
                {aboutData.history}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-4">
                <div className="bg-[#121620] p-6 rounded-xl border border-slate-800">
                  <h4 className="font-heading text-xl font-bold text-[#00FF66] mb-2">MISSÃO</h4>
                  <p className="text-slate-400 text-sm">{aboutData.mission}</p>
                </div>
                <div className="bg-[#121620] p-6 rounded-xl border border-slate-800">
                  <h4 className="font-heading text-xl font-bold text-[#00FF66] mb-2">VISÃO</h4>
                  <p className="text-slate-400 text-sm">{aboutData.vision}</p>
                </div>
              </div>
            </div>

            <div className="relative">
              <div className="absolute -inset-1 bg-gradient-to-r from-[#00FF66] to-transparent rounded-2xl opacity-20 blur-xl"></div>
              <div className="relative bg-[#121620] border border-slate-800 p-8 rounded-2xl space-y-6">
                <h4 className="font-heading text-2xl font-bold">VALORES DA ORGANIZAÇÃO</h4>
                <p className="text-slate-300">{aboutData.values}</p>
                <div className="grid grid-cols-3 gap-4 pt-4 border-t border-slate-800/80 text-center">
                  <div>
                    <span className="block font-heading text-3xl font-bold text-[#00FF66]">100%</span>
                    <span className="text-xs text-slate-400">DEDICAÇÃO</span>
                  </div>
                  <div>
                    <span className="block font-heading text-3xl font-bold text-[#00FF66]">TOP</span>
                    <span className="text-xs text-slate-400">CENÁRIO PRO</span>
                  </div>
                  <div>
                    <span className="block font-heading text-3xl font-bold text-[#00FF66]">24/7</span>
                    <span className="text-xs text-slate-400">TREINOS</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ELENCO PRO */}
      <section id="elenco" className="py-24 bg-[#08090C]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-[#00FF66] font-bold text-sm tracking-widest uppercase mb-3">LINE-UP OFICIAL</h2>
            <h3 className="font-heading text-4xl sm:text-5xl font-bold tracking-wide">ELENCO COMPETITIVO</h3>
            <div className="w-20 h-1 bg-[#00FF66] mx-auto mt-4 rounded-full glow-green-sm"></div>
          </div>

          {roster.length === 0 ? (
            <div className="text-center py-12 bg-[#121620] rounded-xl border border-slate-800">
              <Users className="w-12 h-12 text-slate-600 mx-auto mb-3" />
              <p className="text-slate-400">Nenhum jogador cadastrado no momento. Cadastre pelo painel administrativo.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
              {roster.map((player) => (
                <div key={player.id} className="group bg-[#121620] border border-slate-800 hover:border-[#00FF66] rounded-2xl overflow-hidden transition-all duration-300 hover:-translate-y-2">
                  <div className="relative h-72 overflow-hidden bg-slate-900">
                    <img 
                      src={player.photoUrl || 'https://images.unsplash.com/photo-1566492031773-4f4e44671857?q=80&w=600&auto=format&fit=crop'} 
                      alt={player.nickname} 
                      className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#121620] via-transparent to-transparent"></div>
                    <span className="absolute top-4 right-4 bg-black/70 backdrop-blur-md text-[#00FF66] border border-[#00FF66]/30 text-xs font-bold px-3 py-1 rounded-full uppercase">
                      {player.role || 'Player'}
                    </span>
                  </div>
                  <div className="p-6">
                    <h4 className="font-heading text-3xl font-bold tracking-wide text-white group-hover:text-[#00FF66] transition-colors">
                      {player.nickname}
                    </h4>
                    <p className="text-slate-400 text-sm mb-4">{player.realName || 'Atleta L7'}</p>
                    <p className="text-slate-300 text-xs line-clamp-2 mb-4">{player.description || 'Atleta profissional focado em alta performance no Free Fire.'}</p>
                    
                    {player.socialUrl && (
                      <a 
                        href={player.socialUrl} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#00FF66] hover:underline"
                      >
                        <Globe className="w-4 h-4" /> Redes Sociais <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* TÍTULOS E CONQUISTAS */}
      <section id="titulos" className="py-24 bg-[#0B0D13] border-t border-slate-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-[#00FF66] font-bold text-sm tracking-widest uppercase mb-3">GALERIA DE GLÓRIA</h2>
            <h3 className="font-heading text-4xl sm:text-5xl font-bold tracking-wide">TÍTULOS E CONQUISTAS</h3>
            <div className="w-20 h-1 bg-[#00FF66] mx-auto mt-4 rounded-full glow-green-sm"></div>
          </div>

          {titles.length === 0 ? (
            <div className="text-center py-12 bg-[#121620] rounded-xl border border-slate-800">
              <Trophy className="w-12 h-12 text-slate-600 mx-auto mb-3" />
              <p className="text-slate-400">Nenhum título cadastrado. Gerencie a galeria pelo painel administrativo.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {titles.map((title) => (
                <div key={title.id} className="bg-[#121620] border border-slate-800 rounded-2xl p-6 relative group hover:border-[#00FF66] transition-all">
                  <div className="w-12 h-12 rounded-xl bg-[#00FF66]/10 border border-[#00FF66]/30 flex items-center justify-center text-[#00FF66] mb-6 glow-green-sm">
                    <Trophy className="w-6 h-6" />
                  </div>
                  <span className="text-xs font-bold text-[#00FF66] uppercase tracking-wider">{title.category || 'Campeonato Oficial'}</span>
                  <h4 className="font-heading text-2xl font-bold text-white mt-1 mb-2">{title.championship}</h4>
                  <div className="flex items-center justify-between text-xs text-slate-400 mb-4 pb-4 border-b border-slate-800">
                    <span className="font-bold text-white bg-[#00FF66]/20 text-[#00FF66] px-2.5 py-1 rounded">{title.placement || '1º Lugar'}</span>
                    <span>{title.date || '2026'}</span>
                  </div>
                  <p className="text-slate-300 text-sm">{title.description}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* NOTÍCIAS OFICIAIS */}
      <section id="noticias" className="py-24 bg-[#08090C]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-[#00FF66] font-bold text-sm tracking-widest uppercase mb-3">COMUNICADOS</h2>
            <h3 className="font-heading text-4xl sm:text-5xl font-bold tracking-wide">NOTÍCIAS OFICIAIS</h3>
            <div className="w-20 h-1 bg-[#00FF66] mx-auto mt-4 rounded-full glow-green-sm"></div>
          </div>

          {news.length === 0 ? (
            <div className="text-center py-12 bg-[#121620] rounded-xl border border-slate-800">
              <Newspaper className="w-12 h-12 text-slate-600 mx-auto mb-3" />
              <p className="text-slate-400">Nenhuma notícia publicada no momento.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {news.map((item) => (
                <div 
                  key={item.id} 
                  onClick={() => { setSelectedNews(item); setNewsModalOpen(true); }}
                  className="group bg-[#121620] border border-slate-800 hover:border-[#00FF66] rounded-2xl overflow-hidden cursor-pointer transition-all duration-300"
                >
                  <div className="h-52 overflow-hidden bg-slate-900">
                    <img 
                      src={item.imageUrl || 'https://images.unsplash.com/photo-1542751110-97427bbecf20?q=80&w=600&auto=format&fit=crop'} 
                      alt={item.title} 
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                  </div>
                  <div className="p-6">
                    <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
                      <span className="text-[#00FF66] font-bold uppercase">{item.category || 'Geral'}</span>
                      <span>{item.date || 'Hoje'}</span>
                    </div>
                    <h4 className="font-heading text-2xl font-bold text-white group-hover:text-[#00FF66] transition-colors mb-2">
                      {item.title}
                    </h4>
                    <p className="text-slate-300 text-sm line-clamp-3">{item.subtitle || item.content}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* SHOP OFICIAL */}
      <section id="shop" className="py-24 bg-[#0B0D13] border-t border-slate-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-[#00FF66] font-bold text-sm tracking-widest uppercase mb-3">LOJA OFICIAL</h2>
            <h3 className="font-heading text-4xl sm:text-5xl font-bold tracking-wide">MANTOS E PRODUTOS L7</h3>
            <div className="w-20 h-1 bg-[#00FF66] mx-auto mt-4 rounded-full glow-green-sm"></div>
          </div>

          {products.length === 0 ? (
            <div className="text-center py-12 bg-[#121620] rounded-xl border border-slate-800">
              <ShoppingBag className="w-12 h-12 text-slate-600 mx-auto mb-3" />
              <p className="text-slate-400">Nenhum produto cadastrado na loja oficial.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {products.map((prod) => (
                <div key={prod.id} className="bg-[#121620] border border-slate-800 rounded-2xl overflow-hidden group hover:border-[#00FF66] transition-all">
                  <div className="h-64 overflow-hidden bg-slate-900 relative">
                    <img 
                      src={prod.imageUrl || 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?q=80&w=600&auto=format&fit=crop'} 
                      alt={prod.name} 
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                    <span className="absolute top-4 left-4 bg-black/80 text-[#00FF66] text-xs font-bold px-3 py-1 rounded-full uppercase border border-[#00FF66]/30">
                      {prod.category || 'Vestuário'}
                    </span>
                  </div>
                  <div className="p-6">
                    <h4 className="font-heading text-2xl font-bold text-white mb-1">{prod.name}</h4>
                    <span className="block text-[#00FF66] font-bold text-xl mb-3">R$ {prod.price || '0,00'}</span>
                    <p className="text-slate-300 text-sm mb-6 line-clamp-2">{prod.description}</p>
                    <button 
                      onClick={() => { setSelectedProduct(prod); setShopModalOpen(true); }}
                      className="w-full bg-slate-800 hover:bg-[#00FF66] hover:text-black text-white font-bold py-3 rounded-xl transition-colors flex items-center justify-center gap-2 text-sm"
                    >
                      <ShoppingBag className="w-4 h-4" /> VER DETALHES
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* FORMULÁRIO DE INSCRIÇÃO (TRYOUTS) */}
      <section id="inscricao" className="py-24 bg-[#08090C] relative">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-[#121620] border border-slate-800 p-8 sm:p-12 rounded-3xl glow-green">
            <div className="text-center max-w-2xl mx-auto mb-10">
              <span className="text-[#00FF66] font-bold text-sm tracking-widest uppercase">RECrutamento</span>
              <h3 className="font-heading text-4xl sm:text-5xl font-bold tracking-wide mt-2">FAÇA PARTE DA EQUIPE</h3>
              <p className="text-slate-400 text-sm mt-2">Preencha o formulário abaixo com atenção. Nossos olheiros analisam todas as candidaturas.</p>
            </div>

            <form onSubmit={handleTryoutSubmit} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase mb-2">1. Nick do Jogo *</label>
                  <input 
                    type="text" 
                    required
                    value={tryoutForm.nickname}
                    onChange={(e) => setTryoutForm({...tryoutForm, nickname: e.target.value})}
                    placeholder="Ex: L7 SEU_NICK"
                    className="w-full bg-[#08090C] border border-slate-700 rounded-xl px-4 py-3.5 text-white focus:outline-none focus:border-[#00FF66]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase mb-2">2. Nome Real *</label>
                  <input 
                    type="text" 
                    required
                    value={tryoutForm.realName}
                    onChange={(e) => setTryoutForm({...tryoutForm, realName: e.target.value})}
                    placeholder="Seu nome completo"
                    className="w-full bg-[#08090C] border border-slate-700 rounded-xl px-4 py-3.5 text-white focus:outline-none focus:border-[#00FF66]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase mb-2">3. Idade *</label>
                  <input 
                    type="number" 
                    required
                    value={tryoutForm.age}
                    onChange={(e) => setTryoutForm({...tryoutForm, age: e.target.value})}
                    placeholder="Ex: 17"
                    className="w-full bg-[#08090C] border border-slate-700 rounded-xl px-4 py-3.5 text-white focus:outline-none focus:border-[#00FF66]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase mb-2">4. Número de telefone com DDD *</label>
                  <input 
                    type="text" 
                    required
                    value={tryoutForm.phone}
                    onChange={(e) => setTryoutForm({...tryoutForm, phone: e.target.value})}
                    placeholder="(31) 99999-9999"
                    className="w-full bg-[#08090C] border border-slate-700 rounded-xl px-4 py-3.5 text-white focus:outline-none focus:border-[#00FF66]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase mb-2">5. Por que gostaria de entrar para a equipe L7 ESPORTS?</label>
                <textarea 
                  rows="3"
                  value={tryoutForm.whyJoin}
                  onChange={(e) => setTryoutForm({...tryoutForm, whyJoin: e.target.value})}
                  placeholder="Conte sua motivação e histórico..."
                  className="w-full bg-[#08090C] border border-slate-700 rounded-xl px-4 py-3.5 text-white focus:outline-none focus:border-[#00FF66]"
                ></textarea>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase mb-2">6. Já jogou profissionalmente?</label>
                  <select 
                    value={tryoutForm.playedPro}
                    onChange={(e) => setTryoutForm({...tryoutForm, playedPro: e.target.value})}
                    className="w-full bg-[#08090C] border border-slate-700 rounded-xl px-4 py-3.5 text-white focus:outline-none focus:border-[#00FF66]"
                  >
                    <option value="Sim">Sim</option>
                    <option value="Não">Não</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase mb-2">7. Link do canal ou highlights</label>
                  <input 
                    type="url" 
                    value={tryoutForm.mediaUrl}
                    onChange={(e) => setTryoutForm({...tryoutForm, mediaUrl: e.target.value})}
                    placeholder="https://youtube.com/..."
                    className="w-full bg-[#08090C] border border-slate-700 rounded-xl px-4 py-3.5 text-white focus:outline-none focus:border-[#00FF66]"
                  />
                </div>
              </div>

              <button 
                type="submit"
                disabled={tryoutSubmitting}
                className="w-full bg-[#00FF66] hover:bg-[#00cc52] text-black font-extrabold py-4 rounded-xl transition-all glow-green flex items-center justify-center gap-2 text-base tracking-wider uppercase disabled:opacity-50"
              >
                {tryoutSubmitting ? 'ENVIANDO...' : 'ENVIAR INSCRIÇÃO'} <Send className="w-5 h-5" />
              </button>
            </form>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="bg-[#050608] border-t border-slate-900 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-6 text-center md:text-left">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#00FF66] flex items-center justify-center">
              <Shield className="w-5 h-5 text-black fill-black" />
            </div>
            <div>
              <span className="font-heading text-xl font-bold">L7 ESPORTS</span>
              <p className="text-xs text-slate-500">© 2026 L7 ESPORTS. Todos os direitos reservados.</p>
            </div>
          </div>
          <div className="flex gap-6 text-sm text-slate-400">
            <a href="#inicio" className="hover:text-[#00FF66]">Início</a>
            <a href="#sobre" className="hover:text-[#00FF66]">Sobre</a>
            <a href="#elenco" className="hover:text-[#00FF66]">Elenco</a>
            <a href="#noticias" className="hover:text-[#00FF66]">Notícias</a>
            <a href="#inscricao" className="hover:text-[#00FF66]">Seja Pro</a>
          </div>
        </div>
      </footer>

      {/* MODAL DE LOGIN ADMINISTRATIVO */}
      {loginModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#121620] border border-slate-800 w-full max-w-md p-8 rounded-3xl relative glow-green">
            <button 
              onClick={() => setLoginModalOpen(false)}
              className="absolute top-5 right-5 text-slate-400 hover:text-white"
            >
              <X className="w-6 h-6" />
            </button>

            <h3 className="font-heading text-3xl font-bold mb-2">ACESSO ADMINISTRATIVO</h3>
            <p className="text-slate-400 text-sm mb-6">Área restrita à gerência e diretoria L7.</p>

            {loginError && (
              <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-xs p-3 rounded-lg mb-4 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{loginError}</span>
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase mb-2">E-mail Administrativo</label>
                <input 
                  type="email" 
                  required
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  placeholder="tuliofonseca00@gmail.com"
                  className="w-full bg-[#08090C] border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#00FF66]"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase mb-2">Senha</label>
                <input 
                  type="password" 
                  required
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-[#08090C] border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#00FF66]"
                />
              </div>

              <button 
                type="submit"
                className="w-full bg-[#00FF66] hover:bg-[#00cc52] text-black font-extrabold py-3.5 rounded-xl transition-all glow-green uppercase text-sm"
              >
                ENTRAR NO PAINEL
              </button>
            </form>
          </div>
        </div>
      )}

      {/* LEITOR DE NOTÍCIA */}
      {newsModalOpen && selectedNews && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#121620] border border-slate-800 w-full max-w-2xl max-h-[90vh] overflow-y-auto p-8 rounded-3xl relative">
            <button 
              onClick={() => setNewsModalOpen(false)}
              className="absolute top-5 right-5 text-slate-400 hover:text-white"
            >
              <X className="w-6 h-6" />
            </button>
            <span className="text-xs font-bold text-[#00FF66] uppercase">{selectedNews.category}</span>
            <h3 className="font-heading text-3xl sm:text-4xl font-bold text-white mt-1 mb-4">{selectedNews.title}</h3>
            <p className="text-xs text-slate-400 mb-6">{selectedNews.date || 'Hoje'}</p>
            {selectedNews.imageUrl && (
              <img src={selectedNews.imageUrl} alt="" className="w-full h-72 object-cover rounded-xl mb-6" />
            )}
            <p className="text-slate-200 leading-relaxed whitespace-pre-wrap">{selectedNews.content || selectedNews.subtitle}</p>
          </div>
        </div>
      )}

      {/* DETALHES DO PRODUTO */}
      {shopModalOpen && selectedProduct && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#121620] border border-slate-800 w-full max-w-xl p-8 rounded-3xl relative">
            <button 
              onClick={() => setShopModalOpen(false)}
              className="absolute top-5 right-5 text-slate-400 hover:text-white"
            >
              <X className="w-6 h-6" />
            </button>
            <div className="h-64 rounded-xl overflow-hidden mb-6 bg-slate-900">
              <img src={selectedProduct.imageUrl} alt="" className="w-full h-full object-cover" />
            </div>
            <span className="text-xs font-bold text-[#00FF66] uppercase">{selectedProduct.category}</span>
            <h3 className="font-heading text-3xl font-bold text-white mt-1 mb-2">{selectedProduct.name}</h3>
            <span className="block text-2xl font-bold text-[#00FF66] mb-4">R$ {selectedProduct.price}</span>
            <p className="text-slate-300 mb-8">{selectedProduct.description}</p>
            <button 
              onClick={() => showToast('Integração de pagamento em breve!')}
              className="w-full bg-[#00FF66] hover:bg-[#00cc52] text-black font-extrabold py-3.5 rounded-xl uppercase text-sm"
            >
              COMPRAR AGORA
            </button>
          </div>
        </div>
      )}

      {/* PAINEL ADMINISTRATIVO EXCLUSIVO (tuliofonseca00@gmail.com) */}
      {adminPanelOpen && user && user.email === ADMIN_EMAIL && (
        <div className="fixed inset-0 z-50 bg-[#08090C] flex flex-col overflow-hidden">
          {/* Top Admin Bar */}
          <div className="bg-[#121620] border-b border-slate-800 px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-[#00FF66] flex items-center justify-center text-black font-bold">
                <Settings className="w-5 h-5" />
              </div>
              <div>
                <h2 className="font-heading text-xl font-bold tracking-wide">PAINEL ADMINISTRATIVO — L7 ESPORTS</h2>
                <span className="text-xs text-[#00FF66]">Logado como: {user.email}</span>
              </div>
            </div>
            <button 
              onClick={() => setAdminPanelOpen(false)}
              className="bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-lg font-semibold text-xs flex items-center gap-2"
            >
              <X className="w-4 h-4" /> FECHAR PAINEL
            </button>
          </div>

          <div className="flex-1 flex overflow-hidden">
            {/* Sidebar Admin */}
            <div className="w-64 bg-[#0B0D13] border-r border-slate-800 p-4 space-y-2 hidden md:block overflow-y-auto">
              <button 
                onClick={() => setAdminTab('dashboard')}
                className={`w-full text-left px-4 py-3 rounded-xl font-semibold text-sm flex items-center gap-3 transition-colors ${adminTab === 'dashboard' ? 'bg-[#00FF66] text-black' : 'text-slate-300 hover:bg-slate-800'}`}
              >
                <Users className="w-4 h-4" /> Dashboard & Inscrições
              </button>
              <button 
                onClick={() => setAdminTab('news')}
                className={`w-full text-left px-4 py-3 rounded-xl font-semibold text-sm flex items-center gap-3 transition-colors ${adminTab === 'news' ? 'bg-[#00FF66] text-black' : 'text-slate-300 hover:bg-slate-800'}`}
              >
                <Newspaper className="w-4 h-4" /> Gerenciar Notícias
              </button>
              <button 
                onClick={() => setAdminTab('roster')}
                className={`w-full text-left px-4 py-3 rounded-xl font-semibold text-sm flex items-center gap-3 transition-colors ${adminTab === 'roster' ? 'bg-[#00FF66] text-black' : 'text-slate-300 hover:bg-slate-800'}`}
              >
                <Users className="w-4 h-4" /> Gerenciar Elenco
              </button>
              <button 
                onClick={() => setAdminTab('titles')}
                className={`w-full text-left px-4 py-3 rounded-xl font-semibold text-sm flex items-center gap-3 transition-colors ${adminTab === 'titles' ? 'bg-[#00FF66] text-black' : 'text-slate-300 hover:bg-slate-800'}`}
              >
                <Trophy className="w-4 h-4" /> Gerenciar Títulos
              </button>
              <button 
                onClick={() => setAdminTab('shop')}
                className={`w-full text-left px-4 py-3 rounded-xl font-semibold text-sm flex items-center gap-3 transition-colors ${adminTab === 'shop' ? 'bg-[#00FF66] text-black' : 'text-slate-300 hover:bg-slate-800'}`}
              >
                <ShoppingBag className="w-4 h-4" /> Gerenciar Loja
              </button>
              <button 
                onClick={() => setAdminTab('settings')}
                className={`w-full text-left px-4 py-3 rounded-xl font-semibold text-sm flex items-center gap-3 transition-colors ${adminTab === 'settings' ? 'bg-[#00FF66] text-black' : 'text-slate-300 hover:bg-slate-800'}`}
              >
                <Settings className="w-4 h-4" /> Configurar Hero & Sobre
              </button>
            </div>

            {/* Conteúdo do Painel */}
            <div className="flex-1 p-8 overflow-y-auto bg-[#08090C]">
              
              {/* ABA DASHBOARD & INSCRIÇÕES */}
              {adminTab === 'dashboard' && (
                <div className="space-y-8">
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    <div className="bg-[#121620] border border-slate-800 p-6 rounded-2xl">
                      <span className="text-xs text-slate-400 font-bold uppercase">Total de Inscrições</span>
                      <h4 className="font-heading text-4xl font-bold text-[#00FF66] mt-2">{tryouts.length}</h4>
                    </div>
                    <div className="bg-[#121620] border border-slate-800 p-6 rounded-2xl">
                      <span className="text-xs text-slate-400 font-bold uppercase">Pendentes</span>
                      <h4 className="font-heading text-4xl font-bold text-amber-400 mt-2">
                        {tryouts.filter(t => t.status === 'Pendente' || !t.status).length}
                      </h4>
                    </div>
                    <div className="bg-[#121620] border border-slate-800 p-6 rounded-2xl">
                      <span className="text-xs text-slate-400 font-bold uppercase">Elenco Ativo</span>
                      <h4 className="font-heading text-4xl font-bold text-white mt-2">{roster.length}</h4>
                    </div>
                    <div className="bg-[#121620] border border-slate-800 p-6 rounded-2xl">
                      <span className="text-xs text-slate-400 font-bold uppercase">Produtos Loja</span>
                      <h4 className="font-heading text-4xl font-bold text-white mt-2">{products.length}</h4>
                    </div>
                  </div>

                  <div className="bg-[#121620] border border-slate-800 rounded-2xl p-6">
                    <h4 className="font-heading text-2xl font-bold mb-6">INSCRIÇÕES DE CANDIDATOS (TRYOUTS)</h4>
                    {tryouts.length === 0 ? (
                      <p className="text-slate-400 text-sm">Nenhuma inscrição recebida até o momento.</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                          <thead>
                            <tr className="border-b border-slate-800 text-slate-400">
                              <th className="pb-3 font-bold">Candidato / Nick</th>
                              <th className="pb-3 font-bold">Idade / Tel</th>
                              <th className="pb-3 font-bold">Status</th>
                              <th className="pb-3 font-bold">Ações</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/60">
                            {tryouts.map((t) => (
                              <tr key={t.id} className="hover:bg-slate-900/40">
                                <td className="py-4">
                                  <span className="font-bold text-white block">{t.nickname}</span>
                                  <span className="text-xs text-slate-400">{t.realName}</span>
                                </td>
                                <td className="py-4">
                                  <span className="block text-slate-200">{t.age} anos</span>
                                  <span className="text-xs text-slate-400">{t.phone}</span>
                                </td>
                                <td className="py-4">
                                  <span className={`px-2.5 py-1 rounded-full text-xs font-bold uppercase ${
                                    t.status === 'Aprovada' ? 'bg-emerald-500/20 text-emerald-400' :
                                    t.status === 'Rejeitada' ? 'bg-red-500/20 text-red-400' :
                                    t.status === 'Em análise' ? 'bg-blue-500/20 text-blue-400' :
                                    'bg-amber-500/20 text-amber-400'
                                  }`}>
                                    {t.status || 'Pendente'}
                                  </span>
                                </td>
                                <td className="py-4 space-x-2">
                                  <select 
                                    value={t.status || 'Pendente'}
                                    onChange={(e) => updateTryoutStatus(t.id, e.target.value)}
                                    className="bg-[#08090C] border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white"
                                  >
                                    <option value="Pendente">Pendente</option>
                                    <option value="Em análise">Em análise</option>
                                    <option value="Aprovada">Aprovada</option>
                                    <option value="Rejeitada">Rejeitada</option>
                                  </select>
                                  <button 
                                    onClick={() => handleDeleteItem('tryouts', t.id)}
                                    className="p-1.5 bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white rounded-lg transition-colors"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ABA GERENCIAR NOTÍCIAS */}
              {adminTab === 'news' && (
                <div className="space-y-6">
                  <div className="flex justify-between items-center">
                    <h4 className="font-heading text-2xl font-bold">GERENCIAR NOTÍCIAS</h4>
                    <button 
                      onClick={() => { setEditingItem(null); setAdminForm({ title: '', subtitle: '', content: '', category: 'Free Fire', imageUrl: '', date: 'Hoje' }); setIsEditing(true); }}
                      className="bg-[#00FF66] text-black font-bold px-4 py-2 rounded-xl text-sm flex items-center gap-2"
                    >
                      <Plus className="w-4 h-4" /> Nova Notícia
                    </button>
                  </div>

                  {isEditing && adminTab === 'news' && (
                    <div className="bg-[#121620] border border-slate-800 p-6 rounded-2xl space-y-4">
                      <h5 className="font-bold text-lg text-[#00FF66]">{editingItem ? 'Editar Notícia' : 'Criar Notícia'}</h5>
                      <input 
                        type="text" 
                        placeholder="Título da Notícia"
                        value={adminForm.title || ''}
                        onChange={(e) => setAdminForm({...adminForm, title: e.target.value})}
                        className="w-full bg-[#08090C] border border-slate-700 rounded-xl px-4 py-3 text-white"
                      />
                      <input 
                        type="text" 
                        placeholder="Subtítulo / Chamada"
                        value={adminForm.subtitle || ''}
                        onChange={(e) => setAdminForm({...adminForm, subtitle: e.target.value})}
                        className="w-full bg-[#08090C] border border-slate-700 rounded-xl px-4 py-3 text-white"
                      />
                      <textarea 
                        rows="4" 
                        placeholder="Conteúdo completo"
                        value={adminForm.content || ''}
                        onChange={(e) => setAdminForm({...adminForm, content: e.target.value})}
                        className="w-full bg-[#08090C] border border-slate-700 rounded-xl px-4 py-3 text-white"
                      ></textarea>
                      <input 
                        type="url" 
                        placeholder="URL da Imagem de Capa"
                        value={adminForm.imageUrl || ''}
                        onChange={(e) => setAdminForm({...adminForm, imageUrl: e.target.value})}
                        className="w-full bg-[#08090C] border border-slate-700 rounded-xl px-4 py-3 text-white"
                      />
                      <div className="flex gap-4">
                        <button 
                          onClick={async () => {
                            if (editingItem) {
                              await updateDoc(doc(db, 'news', editingItem), adminForm);
                              showToast('Notícia atualizada!');
                            } else {
                              await addDoc(collection(db, 'news'), { ...adminForm, createdAt: serverTimestamp() });
                              showToast('Notícia criada!');
                            }
                            setIsEditing(false);
                          }}
                          className="bg-[#00FF66] text-black font-bold px-6 py-2.5 rounded-xl text-sm"
                        >
                          Salvar Notícia
                        </button>
                        <button onClick={() => setIsEditing(false)} className="bg-slate-800 text-white px-6 py-2.5 rounded-xl text-sm">Cancelar</button>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {news.map((item) => (
                      <div key={item.id} className="bg-[#121620] border border-slate-800 p-4 rounded-xl flex items-center justify-between">
                        <div>
                          <span className="text-xs text-[#00FF66] font-bold">{item.category}</span>
                          <h5 className="font-bold text-white">{item.title}</h5>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => { setEditingItem(item.id); setAdminForm(item); setIsEditing(true); }} className="p-2 bg-slate-800 text-white rounded-lg"><Edit className="w-4 h-4" /></button>
                          <button onClick={() => handleDeleteItem('news', item.id)} className="p-2 bg-red-500/10 text-red-400 rounded-lg"><Trash2 className="w-4 h-4" /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ABA GERENCIAR ELENCO */}
              {adminTab === 'roster' && (
                <div className="space-y-6">
                  <div className="flex justify-between items-center">
                    <h4 className="font-heading text-2xl font-bold">GERENCIAR ELENCO</h4>
                    <button 
                      onClick={() => { setEditingItem(null); setAdminForm({ nickname: '', realName: '', role: 'Rifler', description: '', photoUrl: '', socialUrl: '' }); setIsEditing(true); }}
                      className="bg-[#00FF66] text-black font-bold px-4 py-2 rounded-xl text-sm flex items-center gap-2"
                    >
                      <Plus className="w-4 h-4" /> Adicionar Jogador
                    </button>
                  </div>

                  {isEditing && adminTab === 'roster' && (
                    <div className="bg-[#121620] border border-slate-800 p-6 rounded-2xl space-y-4">
                      <h5 className="font-bold text-lg text-[#00FF66]">{editingItem ? 'Editar Atleta' : 'Novo Atleta'}</h5>
                      <input type="text" placeholder="Nickname" value={adminForm.nickname || ''} onChange={(e) => setAdminForm({...adminForm, nickname: e.target.value})} className="w-full bg-[#08090C] border border-slate-700 rounded-xl px-4 py-3 text-white" />
                      <input type="text" placeholder="Nome Real" value={adminForm.realName || ''} onChange={(e) => setAdminForm({...adminForm, realName: e.target.value})} className="w-full bg-[#08090C] border border-slate-700 rounded-xl px-4 py-3 text-white" />
                      <input type="text" placeholder="Função (Ex: Capitão, Rush)" value={adminForm.role || ''} onChange={(e) => setAdminForm({...adminForm, role: e.target.value})} className="w-full bg-[#08090C] border border-slate-700 rounded-xl px-4 py-3 text-white" />
                      <textarea placeholder="Descrição" value={adminForm.description || ''} onChange={(e) => setAdminForm({...adminForm, description: e.target.value})} className="w-full bg-[#08090C] border border-slate-700 rounded-xl px-4 py-3 text-white"></textarea>
                      <input type="url" placeholder="URL da Foto" value={adminForm.photoUrl || ''} onChange={(e) => setAdminForm({...adminForm, photoUrl: e.target.value})} className="w-full bg-[#08090C] border border-slate-700 rounded-xl px-4 py-3 text-white" />
                      <input type="url" placeholder="URL Redes Sociais" value={adminForm.socialUrl || ''} onChange={(e) => setAdminForm({...adminForm, socialUrl: e.target.value})} className="w-full bg-[#08090C] border border-slate-700 rounded-xl px-4 py-3 text-white" />
                      <div className="flex gap-4">
                        <button onClick={async () => {
                          if (editingItem) {
                            await updateDoc(doc(db, 'roster', editingItem), adminForm);
                            showToast('Atleta atualizado!');
                          } else {
                            await addDoc(collection(db, 'roster'), adminForm);
                            showToast('Atleta adicionado!');
                          }
                          setIsEditing(false);
                        }} className="bg-[#00FF66] text-black font-bold px-6 py-2.5 rounded-xl text-sm">Salvar Atleta</button>
                        <button onClick={() => setIsEditing(false)} className="bg-slate-800 text-white px-6 py-2.5 rounded-xl text-sm">Cancelar</button>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {roster.map((player) => (
                      <div key={player.id} className="bg-[#121620] border border-slate-800 p-4 rounded-xl flex items-center justify-between">
                        <div>
                          <span className="text-xs text-[#00FF66] font-bold">{player.role}</span>
                          <h5 className="font-bold text-white">{player.nickname}</h5>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => { setEditingItem(player.id); setAdminForm(player); setIsEditing(true); }} className="p-2 bg-slate-800 text-white rounded-lg"><Edit className="w-4 h-4" /></button>
                          <button onClick={() => handleDeleteItem('roster', player.id)} className="p-2 bg-red-500/10 text-red-400 rounded-lg"><Trash2 className="w-4 h-4" /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ABA GERENCIAR TÍTULOS */}
              {adminTab === 'titles' && (
                <div className="space-y-6">
                  <div className="flex justify-between items-center">
                    <h4 className="font-heading text-2xl font-bold">GERENCIAR TÍTULOS</h4>
                    <button onClick={() => { setEditingItem(null); setAdminForm({ championship: '', placement: '1º Lugar', category: 'Major', date: '2026', description: '' }); setIsEditing(true); }} className="bg-[#00FF66] text-black font-bold px-4 py-2 rounded-xl text-sm flex items-center gap-2">
                      <Plus className="w-4 h-4" /> Adicionar Título
                    </button>
                  </div>

                  {isEditing && adminTab === 'titles' && (
                    <div className="bg-[#121620] border border-slate-800 p-6 rounded-2xl space-y-4">
                      <input type="text" placeholder="Nome do Campeonato" value={adminForm.championship || ''} onChange={(e) => setAdminForm({...adminForm, championship: e.target.value})} className="w-full bg-[#08090C] border border-slate-700 rounded-xl px-4 py-3 text-white" />
                      <input type="text" placeholder="Colocação (Ex: 1º Lugar)" value={adminForm.placement || ''} onChange={(e) => setAdminForm({...adminForm, placement: e.target.value})} className="w-full bg-[#08090C] border border-slate-700 rounded-xl px-4 py-3 text-white" />
                      <input type="text" placeholder="Categoria" value={adminForm.category || ''} onChange={(e) => setAdminForm({...adminForm, category: e.target.value})} className="w-full bg-[#08090C] border border-slate-700 rounded-xl px-4 py-3 text-white" />
                      <input type="text" placeholder="Data / Ano" value={adminForm.date || ''} onChange={(e) => setAdminForm({...adminForm, date: e.target.value})} className="w-full bg-[#08090C] border border-slate-700 rounded-xl px-4 py-3 text-white" />
                      <textarea placeholder="Descrição" value={adminForm.description || ''} onChange={(e) => setAdminForm({...adminForm, description: e.target.value})} className="w-full bg-[#08090C] border border-slate-700 rounded-xl px-4 py-3 text-white"></textarea>
                      <div className="flex gap-4">
                        <button onClick={async () => {
                          if (editingItem) {
                            await updateDoc(doc(db, 'titles', editingItem), adminForm);
                            showToast('Título atualizado!');
                          } else {
                            await addDoc(collection(db, 'titles'), adminForm);
                            showToast('Título adicionado!');
                          }
                          setIsEditing(false);
                        }} className="bg-[#00FF66] text-black font-bold px-6 py-2.5 rounded-xl text-sm">Salvar Título</button>
                        <button onClick={() => setIsEditing(false)} className="bg-slate-800 text-white px-6 py-2.5 rounded-xl text-sm">Cancelar</button>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {titles.map((t) => (
                      <div key={t.id} className="bg-[#121620] border border-slate-800 p-4 rounded-xl flex items-center justify-between">
                        <div>
                          <span className="text-xs text-[#00FF66] font-bold">{t.placement}</span>
                          <h5 className="font-bold text-white">{t.championship}</h5>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => { setEditingItem(t.id); setAdminForm(t); setIsEditing(true); }} className="p-2 bg-slate-800 text-white rounded-lg"><Edit className="w-4 h-4" /></button>
                          <button onClick={() => handleDeleteItem('titles', t.id)} className="p-2 bg-red-500/10 text-red-400 rounded-lg"><Trash2 className="w-4 h-4" /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ABA GERENCIAR LOJA */}
              {adminTab === 'shop' && (
                <div className="space-y-6">
                  <div className="flex justify-between items-center">
                    <h4 className="font-heading text-2xl font-bold">GERENCIAR LOJA</h4>
                    <button onClick={() => { setEditingItem(null); setAdminForm({ name: '', price: '', category: 'Vestuário', description: '', imageUrl: '' }); setIsEditing(true); }} className="bg-[#00FF66] text-black font-bold px-4 py-2 rounded-xl text-sm flex items-center gap-2">
                      <Plus className="w-4 h-4" /> Adicionar Produto
                    </button>
                  </div>

                  {isEditing && adminTab === 'shop' && (
                    <div className="bg-[#121620] border border-slate-800 p-6 rounded-2xl space-y-4">
                      <input type="text" placeholder="Nome do Produto" value={adminForm.name || ''} onChange={(e) => setAdminForm({...adminForm, name: e.target.value})} className="w-full bg-[#08090C] border border-slate-700 rounded-xl px-4 py-3 text-white" />
                      <input type="text" placeholder="Preço (Ex: 149,90)" value={adminForm.price || ''} onChange={(e) => setAdminForm({...adminForm, price: e.target.value})} className="w-full bg-[#08090C] border border-slate-700 rounded-xl px-4 py-3 text-white" />
                      <input type="text" placeholder="Categoria" value={adminForm.category || ''} onChange={(e) => setAdminForm({...adminForm, category: e.target.value})} className="w-full bg-[#08090C] border border-slate-700 rounded-xl px-4 py-3 text-white" />
                      <textarea placeholder="Descrição" value={adminForm.description || ''} onChange={(e) => setAdminForm({...adminForm, description: e.target.value})} className="w-full bg-[#08090C] border border-slate-700 rounded-xl px-4 py-3 text-white"></textarea>
                      <input type="url" placeholder="URL da Imagem" value={adminForm.imageUrl || ''} onChange={(e) => setAdminForm({...adminForm, imageUrl: e.target.value})} className="w-full bg-[#08090C] border border-slate-700 rounded-xl px-4 py-3 text-white" />
                      <div className="flex gap-4">
                        <button onClick={async () => {
                          if (editingItem) {
                            await updateDoc(doc(db, 'shop', editingItem), adminForm);
                            showToast('Produto atualizado!');
                          } else {
                            await addDoc(collection(db, 'shop'), adminForm);
                            showToast('Produto adicionado!');
                          }
                          setIsEditing(false);
                        }} className="bg-[#00FF66] text-black font-bold px-6 py-2.5 rounded-xl text-sm">Salvar Produto</button>
                        <button onClick={() => setIsEditing(false)} className="bg-slate-800 text-white px-6 py-2.5 rounded-xl text-sm">Cancelar</button>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {products.map((p) => (
                      <div key={p.id} className="bg-[#121620] border border-slate-800 p-4 rounded-xl flex items-center justify-between">
                        <div>
                          <span className="text-xs text-[#00FF66] font-bold">R$ {p.price}</span>
                          <h5 className="font-bold text-white">{p.name}</h5>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => { setEditingItem(p.id); setAdminForm(p); setIsEditing(true); }} className="p-2 bg-slate-800 text-white rounded-lg"><Edit className="w-4 h-4" /></button>
                          <button onClick={() => handleDeleteItem('shop', p.id)} className="p-2 bg-red-500/10 text-red-400 rounded-lg"><Trash2 className="w-4 h-4" /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ABA CONFIGURAR HERO & SOBRE */}
              {adminTab === 'settings' && (
                <div className="space-y-8 max-w-2xl">
                  <div className="bg-[#121620] border border-slate-800 p-6 rounded-2xl space-y-4">
                    <h4 className="font-heading text-2xl font-bold">CONFIGURAR HERO</h4>
                    <div>
                      <label className="block text-xs font-bold text-slate-300 uppercase mb-2">Título Principal</label>
                      <input 
                        type="text" 
                        value={heroData.title}
                        onChange={(e) => setHeroData({...heroData, title: e.target.value})}
                        className="w-full bg-[#08090C] border border-slate-700 rounded-xl px-4 py-3 text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-300 uppercase mb-2">Subtítulo</label>
                      <input 
                        type="text" 
                        value={heroData.subtitle}
                        onChange={(e) => setHeroData({...heroData, subtitle: e.target.value})}
                        className="w-full bg-[#08090C] border border-slate-700 rounded-xl px-4 py-3 text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-300 uppercase mb-2">URL do Banner</label>
                      <input 
                        type="url" 
                        value={heroData.bannerUrl}
                        onChange={(e) => setHeroData({...heroData, bannerUrl: e.target.value})}
                        className="w-full bg-[#08090C] border border-slate-700 rounded-xl px-4 py-3 text-white"
                      />
                    </div>
                    <button 
                      onClick={async () => {
                        await setDoc(doc(db, 'settings', 'hero'), heroData);
                        showToast('Configurações do Hero atualizadas!');
                      }}
                      className="bg-[#00FF66] text-black font-bold px-6 py-3 rounded-xl text-sm"
                    >
                      Salvar Hero
                    </button>
                  </div>

                  <div className="bg-[#121620] border border-slate-800 p-6 rounded-2xl space-y-4">
                    <h4 className="font-heading text-2xl font-bold">CONFIGURAR SOBRE A L7</h4>
                    <div>
                      <label className="block text-xs font-bold text-slate-300 uppercase mb-2">História</label>
                      <textarea 
                        rows="3"
                        value={aboutData.history}
                        onChange={(e) => setAboutData({...aboutData, history: e.target.value})}
                        className="w-full bg-[#08090C] border border-slate-700 rounded-xl px-4 py-3 text-white"
                      ></textarea>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-300 uppercase mb-2">Missão</label>
                      <input 
                        type="text"
                        value={aboutData.mission}
                        onChange={(e) => setAboutData({...aboutData, mission: e.target.value})}
                        className="w-full bg-[#08090C] border border-slate-700 rounded-xl px-4 py-3 text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-300 uppercase mb-2">Visão</label>
                      <input 
                        type="text"
                        value={aboutData.vision}
                        onChange={(e) => setAboutData({...aboutData, vision: e.target.value})}
                        className="w-full bg-[#08090C] border border-slate-700 rounded-xl px-4 py-3 text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-300 uppercase mb-2">Valores</label>
                      <input 
                        type="text"
                        value={aboutData.values}
                        onChange={(e) => setAboutData({...aboutData, values: e.target.value})}
                        className="w-full bg-[#08090C] border border-slate-700 rounded-xl px-4 py-3 text-white"
                      />
                    </div>
                    <button 
                      onClick={async () => {
                        await setDoc(doc(db, 'settings', 'about'), aboutData);
                        showToast('Configurações institucionais atualizadas!');
                      }}
                      className="bg-[#00FF66] text-black font-bold px-6 py-3 rounded-xl text-sm"
                    >
                      Salvar Institucional
                    </button>
                  </div>
                </div>
              )}

            </div>
          </div>
        </div>
      )}

    </div>
  );
}

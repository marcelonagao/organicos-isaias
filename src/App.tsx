import React, { useState, useEffect, useMemo } from 'react';
import { 
  ShoppingCart, Leaf, MapPin, Calendar, 
  CreditCard, Banknote, ChevronLeft, ChevronRight, Plus, Minus, CheckCircle2,
  Store, Search, User, Package, Clock, Truck, ShieldCheck, Map, ListChecks, Tags, BarChart3, TrendingUp, Menu, X, Edit2, Lock, Trash2, ImagePlus, Loader2, Download, Upload, AlertCircle, Database
} from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { getFirestore, collection, addDoc, onSnapshot, doc, setDoc, getDocs, updateDoc, deleteDoc } from 'firebase/firestore';

// --- CONFIGURAÇÃO FIREBASE ---
const firebaseConfig = {
  apiKey: "AIzaSyAn5C_qgjzdb2gf7JaV4ImX58TW1aS8lFo",
  authDomain: "organicos-isaias.firebaseapp.com",
  projectId: "organicos-isaias",
  storageBucket: "organicos-isaias.firebasestorage.app",
  messagingSenderId: "18242333231",
  appId: "1:18242333231:web:212a64c1c45e8f1025b4da"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = firebaseConfig.projectId || 'default-app-id';

// Função para formatar para Reais (BRL)
const formatCurrency = (value) => {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
};

// Dicionário de Status
const statusDict = {
  pending: { label: 'Recebido', color: 'bg-yellow-100 text-yellow-800', icon: Clock },
  preparing: { label: 'Em Separação', color: 'bg-blue-100 text-blue-800', icon: Package },
  in_transit: { label: 'Em Rota', color: 'bg-purple-100 text-purple-800', icon: Truck },
  delivered: { label: 'Entregue', color: 'bg-green-100 text-green-800', icon: CheckCircle2 }
};

export default function App() {
  // --- ESTADOS ---
  const [user, setUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [view, setView] = useState('home'); 
  const [products, setProducts] = useState([]);
  const [settings, setSettings] = useState(null);
  const [cart, setCart] = useState([]);
  const [orders, setOrders] = useState([]); 
  const [allOrders, setAllOrders] = useState([]); 
  const [loading, setLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('Todos');

  // Estados do Painel Admin
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [adminTab, setAdminTab] = useState('dashboard');
  const [adminDateFilter, setAdminDateFilter] = useState('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  
  // Estados para Gestão de Produtos
  const [showNewProductForm, setShowNewProductForm] = useState(false);
  const [editingProductId, setEditingProductId] = useState(null);
  const [newProduct, setNewProduct] = useState({ name: '', price: '', unit: 'unidade', category: 'Verduras', imageUrl: '📦' });
  const [imageFileName, setImageFileName] = useState(''); 

  // Estados do Checkout
  const [checkoutStep, setCheckoutStep] = useState(1);
  const [checkoutForm, setCheckoutForm] = useState({
    name: '', phone: '', zipCode: '', street: '', number: '', neighborhood: '', city: '', state: '',
    deliveryDate: '', paymentMethod: 'cash', changeFor: ''
  });

  // --- AUTENTICAÇÃO E SESSÃO ---
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          try {
            await signInWithCustomToken(auth, __initial_auth_token);
          } catch (tokenError) {
            console.warn("Token inválido, a usar sessão anónima:", tokenError);
            await signInAnonymously(auth);
          }
        } else if (!auth.currentUser) {
          await signInAnonymously(auth);
        }
      } catch (error) { console.error("Erro na autenticação:", error); }
    };

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        setIsAdmin(!currentUser.isAnonymous);
      } else {
        initAuth();
      }
    });

    return () => unsubscribe();
  }, []);

  // --- BUSCA DE DADOS (FIRESTORE) ---
  useEffect(() => {
    if (!user) return;
    
    const productsRef = collection(db, 'artifacts', appId, 'public', 'data', 'products');
    const unsubProducts = onSnapshot(productsRef, (snapshot) => {
      setProducts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    });

    const settingsRef = collection(db, 'artifacts', appId, 'public', 'data', 'settings');
    const unsubSettings = onSnapshot(settingsRef, async (snapshot) => {
      const configDoc = snapshot.docs.find(doc => doc.id === 'store_config');
      if (configDoc) {
        const data = configDoc.data();
        setSettings(data);
        const activeDays = data.deliveryDays?.filter(d => d.active) || [];
        if (activeDays.length > 0) {
          setCheckoutForm(prev => ({ ...prev, deliveryDate: prev.deliveryDate || activeDays[0].dayOfWeek }));
          setAdminDateFilter(prev => prev || activeDays[0].dayOfWeek); 
        }
      } else {
        // Inicializar com as regras exatas do Sr. Izaias
        const defaultSettings = {
          isOpen: true,
          minimumOrderValue: 30, // Pedido mínimo de 30 reais
          cutoffMessage: "Pedidos da semana encerram Segunda-feira às 19h!",
          deliveryDays: [
            { dayOfWeek: "Terça-feira após 16h (Porto Novo a Martins de Sá)", active: true },
            { dayOfWeek: "Quarta-feira após 8h (Getúba a Tabatinga)", active: true }
          ]
        };
        await setDoc(doc(settingsRef, 'store_config'), defaultSettings);
        setSettings(defaultSettings);
      }
    });

    const ordersRef = collection(db, 'artifacts', appId, 'public', 'data', 'orders');
    const unsubOrders = onSnapshot(ordersRef, (snapshot) => {
      const fetchedOrders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      fetchedOrders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      setAllOrders(fetchedOrders);
      setOrders(fetchedOrders.filter(o => o.userId === user.uid));
    });

    return () => { unsubProducts(); unsubSettings(); unsubOrders(); };
  }, [user]);

  // --- LÓGICA DO CARRINHO ---
  const addToCart = (product) => setCart(prev => prev.find(i => i.id === product.id) ? prev.map(i => i.id === product.id ? { ...i, qty: i.qty + 1 } : i) : [...prev, { ...product, qty: 1 }]);
  const updateQty = (id, delta) => setCart(prev => prev.map(i => i.id === id ? { ...i, qty: i.qty + delta } : i).filter(i => i.qty > 0));
  const cartTotal = useMemo(() => cart.reduce((sum, item) => sum + (item.price * item.qty), 0), [cart]);
  const cartItemsCount = useMemo(() => cart.reduce((sum, item) => sum + item.qty, 0), [cart]);
  
  // Regras de Negócio: Mínimo 30 reais
  const minOrderValue = settings?.minimumOrderValue || 30;
  const isMinOrderMet = cartTotal >= minOrderValue;

  const categories = useMemo(() => {
    const order = ['Verduras', 'Legumes', 'Frutas', 'Laticínios', 'Mercearia', 'Cestas', 'Outros'];
    const currentCats = [...new Set(products.map(p => p.category))];
    const sortedCats = currentCats.sort((a, b) => {
      let indexA = order.indexOf(a);
      let indexB = order.indexOf(b);
      indexA = indexA === -1 ? 99 : indexA;
      indexB = indexB === -1 ? 99 : indexB;
      return indexA - indexB;
    });
    return ['Todos', ...sortedCats];
  }, [products]);
  
  const displayedProducts = useMemo(() => products.filter(p => p.isActive && (selectedCategory === 'Todos' || p.category === selectedCategory)), [products, selectedCategory]);

  // --- INTELIGÊNCIA LOGÍSTICA E KPIS (ADMIN) ---
  const adminFilteredOrders = useMemo(() => allOrders.filter(o => o.deliveryDate === adminDateFilter), [allOrders, adminDateFilter]);

  const harvestList = useMemo(() => {
    const totals = {};
    adminFilteredOrders.forEach(order => {
       order.items.forEach(item => {
          if (!totals[item.productId]) totals[item.productId] = { name: item.name, quantity: 0 };
          totals[item.productId].quantity += item.quantity;
       });
    });
    return Object.values(totals).sort((a, b) => b.quantity - a.quantity);
  }, [adminFilteredOrders]);

  const ordersByNeighborhood = useMemo(() => {
    const grouped = {};
    adminFilteredOrders.forEach(order => {
       const nbhd = order.deliveryAddress.neighborhood || 'Bairro Não Informado';
       if (!grouped[nbhd]) grouped[nbhd] = [];
       grouped[nbhd].push(order);
    });
    return grouped;
  }, [adminFilteredOrders]);

  const dashboardKPIs = useMemo(() => {
    const totalRevenue = allOrders.reduce((sum, order) => sum + (order.status !== 'cancelled' ? order.totalAmount : 0), 0);
    const totalOrders = allOrders.length;
    const citySales = {};
    allOrders.forEach(order => {
      const city = order.deliveryAddress?.city || 'Desconhecida';
      citySales[city] = (citySales[city] || 0) + 1;
    });
    return { totalRevenue, totalOrders, citySales };
  }, [allOrders]);

  // --- AÇÕES DO ADMINISTRADOR ---
  const handleAdminLogin = async (e) => {
    e.preventDefault();
    setLoginError('');
    setIsProcessing(true);
    try {
      await signInWithEmailAndPassword(auth, adminEmail, adminPassword);
      setView('admin');
      setAdminEmail('');
      setAdminPassword('');
    } catch (error) {
      setLoginError('Credenciais inválidas. Verifique o e-mail e a palavra-passe.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleAdminLogout = async () => {
    await signOut(auth);
    setView('home');
  };

  // Botão de Pânico: Abrir/Fechar Loja (Segunda 19h)
  const toggleStoreStatus = async () => {
    if (!settings) return;
    try {
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'store_config'), {
        isOpen: !settings.isOpen
      });
    } catch (error) {
      console.error("Erro ao alterar status da loja", error);
    }
  };

  const updateOrderStatus = async (orderId, newStatus) => {
    try { await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'orders', orderId), { status: newStatus }); } 
    catch (error) { console.error("Erro ao atualizar pedido", error); }
  };

  const toggleProductStatus = async (productId, currentStatus) => {
    try { await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'products', productId), { isActive: !currentStatus }); } 
    catch (error) { console.error("Erro ao atualizar produto", error); }
  };

  const handleImageSelection = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setImageFileName(file.name);
    setIsProcessing(true);

    const reader = new FileReader();
    reader.readAsDataURL(file); 
    
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 600; 
        const MAX_HEIGHT = 600;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) { height *= MAX_WIDTH / width; width = MAX_WIDTH; }
        } else {
          if (height > MAX_HEIGHT) { width *= MAX_HEIGHT / height; height = MAX_HEIGHT; }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        const base64String = canvas.toDataURL('image/jpeg', 0.7); 
        setNewProduct(prev => ({ ...prev, imageUrl: base64String }));
        setIsProcessing(false);
      };
    };
  };

  const handleAddNewProduct = async (e) => {
    e.preventDefault();
    if (!newProduct.name || !newProduct.price) return;
    
    setIsProcessing(true);

    try {
      const productData = {
        ...newProduct, 
        price: parseFloat(newProduct.price), 
        updatedAt: new Date().toISOString()
      };

      if (editingProductId) {
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'products', editingProductId), productData);
      } else {
        productData.isActive = true;
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'products'), productData);
      }

      setNewProduct({ name: '', price: '', unit: 'unidade', category: 'Verduras', imageUrl: '📦' });
      setImageFileName('');
      setEditingProductId(null);
      setShowNewProductForm(false);
    } catch (error) { 
      console.error("Erro ao guardar produto:", error);
      alert("Falha ao guardar. O arquivo pode estar grande demais.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleEditProduct = (product) => {
    setNewProduct({
      name: product.name,
      price: product.price.toString(), 
      unit: product.unit,
      category: product.category,
      imageUrl: product.imageUrl || ''
    });
    setImageFileName(''); 
    setEditingProductId(product.id);
    setShowNewProductForm(true);
  };

  const handleDeleteProduct = async (productId) => {
    if (window.confirm("Tem a certeza que deseja eliminar este produto? Esta ação não pode ser desfeita.")) {
      try {
        await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'products', productId));
      } catch (error) { console.error("Erro ao eliminar produto:", error); }
    }
  };

  const handleCancelForm = () => {
    setShowNewProductForm(false);
    setEditingProductId(null);
    setImageFileName('');
    setNewProduct({ name: '', price: '', unit: 'unidade', category: 'Verduras', imageUrl: '📦' });
  };

  // --- EXPORTAÇÃO E IMPORTAÇÃO DE CSV ---
  const handleExportCSV = () => {
    const headers = ['id', 'name', 'price', 'unit', 'category', 'isActive', 'imageUrl'];
    const csvContent = [
      headers.join(';'), 
      ...products.map(p => {
        return [
          p.id,
          `"${p.name}"`,
          p.price,
          `"${p.unit}"`,
          `"${p.category}"`,
          p.isActive,
          `"${p.imageUrl || ''}"`
        ].join(';');
      })
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'catalogo_organicos_izaias.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleImportCSV = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!window.confirm("Atenção: A importação irá atualizar produtos existentes e criar novos. Recomendamos fazer um Exportar CSV antes por segurança. Deseja continuar?")) {
      e.target.value = null;
      return;
    }

    setIsProcessing(true);
    const reader = new FileReader();

    reader.onload = async (event) => {
      try {
        const text = event.target.result;
        const rows = text.split('\n').filter(row => row.trim() !== '');
        if (rows.length < 2) throw new Error("O ficheiro CSV está vazio ou inválido.");

        const separator = rows[0].includes(';') ? ';' : ',';
        const headers = rows[0].split(separator).map(h => h.trim().replace(/"/g, ''));

        const idIdx = headers.indexOf('id');
        const nameIdx = headers.indexOf('name');
        const priceIdx = headers.indexOf('price');
        const unitIdx = headers.indexOf('unit');
        const catIdx = headers.indexOf('category');
        const activeIdx = headers.indexOf('isActive');
        const imgIdx = headers.indexOf('imageUrl');

        if (nameIdx === -1 || priceIdx === -1) throw new Error("As colunas 'name' e 'price' são obrigatórias.");

        const batchPromises = [];

        for (let i = 1; i < rows.length; i++) {
          const cleanRow = rows[i].split(separator).map(val => val.replace(/^"|"$/g, '').trim());

          const id = idIdx !== -1 ? cleanRow[idIdx] : null;
          const name = cleanRow[nameIdx];
          let priceStr = cleanRow[priceIdx];
          
          if (!name || !priceStr) continue;

          priceStr = priceStr.replace(',', '.');
          const price = parseFloat(priceStr);

          if (isNaN(price)) continue;

          const unit = unitIdx !== -1 && cleanRow[unitIdx] ? cleanRow[unitIdx] : 'unidade';
          const category = catIdx !== -1 && cleanRow[catIdx] ? cleanRow[catIdx] : 'Outros';
          const isActive = activeIdx !== -1 ? (cleanRow[activeIdx].toLowerCase() === 'true') : true;
          const imageUrl = imgIdx !== -1 && cleanRow[imgIdx] ? cleanRow[imgIdx] : '📦';

          const productData = { name, price, unit, category, isActive, imageUrl, updatedAt: new Date().toISOString() };

          if (id && id.length > 5) {
            batchPromises.push(updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'products', id), productData));
          } else {
            batchPromises.push(addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'products'), productData));
          }
        }

        await Promise.all(batchPromises);
        alert("Catálogo atualizado via CSV com sucesso!");
      } catch (error) {
        console.error(error);
        alert("Erro ao importar CSV: " + error.message);
      } finally {
        setIsProcessing(false);
        e.target.value = null; 
      }
    };
    reader.readAsText(file);
  };


  // --- LÓGICA DE CHECKOUT E API ---
  const handleFormChange = (e) => setCheckoutForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  const handleCepChange = async (e) => {
    let cep = e.target.value.replace(/\D/g, ''); 
    setCheckoutForm(prev => ({ ...prev, zipCode: e.target.value }));
    if (cep.length === 8) {
      try {
        const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
        const data = await res.json();
        if (!data.erro) setCheckoutForm(prev => ({ ...prev, street: data.logradouro || prev.street, neighborhood: data.bairro || prev.neighborhood, city: data.localidade || prev.city, state: data.uf || prev.state }));
      } catch (error) { console.error(error); }
    }
  };

  const nextCheckoutStep = (stepNumber) => {
    if (stepNumber === 2 && (!checkoutForm.name || !checkoutForm.phone)) return alert("Preencha Nome e WhatsApp.");
    if (stepNumber === 3 && (!checkoutForm.zipCode || !checkoutForm.street || !checkoutForm.number)) return alert("Preencha os dados do endereço.");
    if (stepNumber === 4 && (!checkoutForm.deliveryDate)) return alert("Selecione uma data de entrega.");
    setCheckoutStep(stepNumber);
  };

  const submitOrder = async (e) => {
    e.preventDefault();
    if (!user) return;
    setIsProcessing(true);
    try {
      const orderData = {
        userId: user.uid,
        customer: { name: checkoutForm.name, phone: checkoutForm.phone },
        items: cart.map(item => ({ productId: item.id, name: item.name, price: item.price, quantity: item.qty, imageUrl: item.imageUrl || '' })),
        totalAmount: cartTotal,
        deliveryAddress: { zipCode: checkoutForm.zipCode, street: checkoutForm.street, number: checkoutForm.number, neighborhood: checkoutForm.neighborhood, city: checkoutForm.city, state: checkoutForm.state },
        deliveryDate: checkoutForm.deliveryDate,
        status: "pending",
        paymentInfo: {
          method: checkoutForm.paymentMethod,
          changeFor: checkoutForm.paymentMethod === 'cash' ? checkoutForm.changeFor : null,
          status: checkoutForm.paymentMethod === 'cash' ? 'awaiting_payment' : 'pending_gateway'
        },
        createdAt: new Date().toISOString()
      };
      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'orders'), orderData);
      setCart([]);
      setCheckoutStep(1); 
      setView('success');
    } catch (error) { alert("Erro ao processar pedido."); } 
    finally { setIsProcessing(false); }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-[#f5f5f5] text-[#008c43] font-bold">A carregar app...</div>;

  const isImageValidUrl = (str) => {
    if (!str) return false;
    return str.startsWith('http') || str.startsWith('data:image/');
  };

  // ==========================================
  // VISTA DO ADMINISTRADOR (SISTEMA COM SIDEBAR)
  // ==========================================
  if (view === 'admin' && isAdmin) {
    return (
      <div className="flex h-screen bg-stone-100 font-sans overflow-hidden">
        {/* Mobile Header / Hamburger */}
        <div className="md:hidden fixed top-0 left-0 right-0 h-16 bg-[#005e33] text-white flex items-center justify-between px-4 z-50">
          <div className="flex items-center gap-2 font-bold"><ShieldCheck size={20} className="text-orange-400" /> Admin</div>
          <button onClick={() => setIsSidebarOpen(!isSidebarOpen)}><Menu size={24} /></button>
        </div>

        {/* Sidebar (Menu Lateral) */}
        <aside className={`${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0 fixed md:static top-0 left-0 h-full w-64 bg-stone-900 text-stone-300 transition-transform duration-300 z-40 flex flex-col`}>
          <div className="h-16 flex items-center px-6 bg-stone-950 font-bold text-white tracking-wide border-b border-stone-800">
            <Leaf size={20} className="text-[#00a650] mr-2" /> Orgânicos Izaias
          </div>
          
          <div className="p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-stone-500 mb-2 mt-4 px-2">Menu Principal</p>
            <nav className="flex flex-col gap-1">
              {[
                { id: 'dashboard', icon: BarChart3, label: 'Resumo / KPIs' },
                { id: 'colheita', icon: ListChecks, label: 'Lista de Colheita' },
                { id: 'roteiro', icon: Map, label: 'Roteiro de Entregas' },
                { id: 'catalogo', icon: Tags, label: 'Catálogo de Produtos' }
              ].map(item => (
                <button 
                  key={item.id} 
                  onClick={() => { setAdminTab(item.id); setIsSidebarOpen(false); }}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-colors ${adminTab === item.id ? 'bg-[#008c43] text-white' : 'hover:bg-stone-800 hover:text-white'}`}
                >
                  <item.icon size={18} /> {item.label}
                </button>
              ))}
            </nav>
          </div>

          <div className="mt-auto p-4 border-t border-stone-800">
            <button onClick={handleAdminLogout} className="flex items-center gap-3 px-4 py-3 w-full rounded-lg font-medium hover:bg-stone-800 text-stone-400 hover:text-white transition-colors">
              <ChevronLeft size={18} /> Sair do Painel
            </button>
          </div>
        </aside>

        {/* Conteúdo Principal do Admin */}
        <main className="flex-1 h-full overflow-y-auto bg-stone-100 pt-16 md:pt-0 relative">
          <div className="max-w-5xl mx-auto w-full p-4 md:p-8 pb-32">
            
            {/* Header de Filtro para Abas de Logística */}
            {['colheita', 'roteiro'].includes(adminTab) && (
              <div className="bg-white p-5 rounded-2xl shadow-sm border border-stone-200 mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-bold text-stone-800">Logística e Separação</h2>
                  <p className="text-sm text-stone-500">Filtrando pedidos agendados.</p>
                </div>
                <div className="flex items-center gap-3 bg-stone-50 p-2 rounded-xl border border-stone-100">
                  <Calendar size={18} className="text-[#008c43] ml-2" />
                  <select value={adminDateFilter} onChange={(e) => setAdminDateFilter(e.target.value)} className="bg-transparent text-stone-800 font-bold py-1 pr-4 outline-none cursor-pointer max-w-[200px] truncate">
                    {settings?.deliveryDays?.map(d => <option key={d.dayOfWeek} value={d.dayOfWeek}>{d.dayOfWeek}</option>)}
                  </select>
                </div>
              </div>
            )}

            {/* Abas de Conteúdo */}
            {adminTab === 'dashboard' && (
              <div className="space-y-6 animate-in fade-in">
                
                {/* BOTÃO DE PÂNICO: ABRIR E FECHAR LOJA */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-stone-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                  <div>
                    <h3 className="text-lg font-bold text-stone-800 flex items-center gap-2">
                      <Store size={20} className={settings?.isOpen ? 'text-green-600' : 'text-red-600'} /> Status da Loja
                    </h3>
                    <p className="text-sm text-stone-500 mt-1">Ao chegar Segunda-feira às 19h, feche a loja aqui para bloquear novos pedidos.</p>
                  </div>
                  <button
                    onClick={toggleStoreStatus}
                    className={`px-6 py-3 rounded-xl font-bold text-white transition-colors w-full sm:w-auto shadow-sm ${settings?.isOpen ? 'bg-red-500 hover:bg-red-600' : 'bg-[#008c43] hover:bg-[#007035]'}`}
                  >
                    {settings?.isOpen ? 'Encerrar Pedidos da Semana' : 'Reabrir Loja para Pedidos'}
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="bg-white p-6 rounded-2xl shadow-sm border border-stone-200 flex items-center gap-5">
                    <div className="bg-green-100 p-5 rounded-full text-green-700"><TrendingUp size={28} /></div>
                    <div><p className="text-sm font-medium text-stone-500">Faturamento Global</p><h3 className="text-3xl font-bold text-stone-800">{formatCurrency(dashboardKPIs.totalRevenue)}</h3></div>
                  </div>
                  <div className="bg-white p-6 rounded-2xl shadow-sm border border-stone-200 flex items-center gap-5">
                    <div className="bg-blue-100 p-5 rounded-full text-blue-700"><Package size={28} /></div>
                    <div><p className="text-sm font-medium text-stone-500">Total de Pedidos</p><h3 className="text-3xl font-bold text-stone-800">{dashboardKPIs.totalOrders}</h3></div>
                  </div>
                </div>
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-stone-200">
                  <h3 className="text-lg font-bold text-stone-800 mb-4 border-b pb-3">Vendas por Bairro / Cidade</h3>
                  {Object.keys(dashboardKPIs.citySales).length === 0 ? <p className="text-stone-500 text-sm">Sem dados suficientes.</p> : (
                    <div className="space-y-3">
                      {Object.entries(dashboardKPIs.citySales).sort((a, b) => b[1] - a[1]).map(([city, count]) => (
                        <div key={city} className="flex justify-between items-center bg-stone-50 p-3 rounded-lg"><span className="font-medium text-stone-700">{city}</span><span className="bg-white text-stone-800 px-3 py-1 rounded-full border border-stone-200 text-sm font-bold shadow-sm">{count} pedidos</span></div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {adminTab === 'colheita' && (
              <div className="bg-white rounded-2xl shadow-sm border border-stone-200 overflow-hidden animate-in fade-in">
                <div className="bg-[#e6f4ea] p-5 border-b border-[#c8e6c9] flex items-center justify-between">
                  <h3 className="font-bold text-[#007035] flex items-center gap-2"><Leaf size={20}/> Para colher:</h3>
                  <span className="bg-white text-[#007035] shadow-sm py-1.5 px-4 rounded-full text-sm font-bold border border-[#c8e6c9]">{adminFilteredOrders.length} Pedidos</span>
                </div>
                {harvestList.length === 0 ? <p className="p-12 text-center text-stone-500">Nenhum pedido agendado.</p> : (
                  <ul className="divide-y divide-stone-100 p-2">
                    {harvestList.map((item, idx) => (
                      <li key={idx} className="p-4 flex items-center justify-between hover:bg-stone-50 rounded-xl transition-colors">
                        <span className="font-medium text-stone-700 text-lg">{item.name}</span>
                        <span className="font-bold text-2xl text-[#008c43] bg-[#e6f4ea] w-20 h-14 flex items-center justify-center rounded-xl border border-[#c8e6c9]">{item.quantity}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {adminTab === 'roteiro' && (
              <div className="space-y-6 animate-in fade-in">
                {Object.keys(ordersByNeighborhood).length === 0 && <p className="text-center py-12 text-stone-500 bg-white rounded-2xl border border-stone-200">Sem entregas.</p>}
                {Object.keys(ordersByNeighborhood).sort().map(neighborhood => (
                  <div key={neighborhood} className="bg-white rounded-2xl shadow-sm border border-stone-200 overflow-hidden">
                    <div className="bg-stone-50 p-4 border-b border-stone-200 flex justify-between items-center"><h3 className="font-bold text-stone-800 flex items-center gap-2 text-lg"><MapPin size={20} className="text-orange-500"/> {neighborhood}</h3><span className="text-sm font-bold text-stone-500 bg-white px-3 py-1 rounded-full border">{ordersByNeighborhood[neighborhood].length} entregas</span></div>
                    <div className="divide-y divide-stone-100">
                      {ordersByNeighborhood[neighborhood].map(order => (
                        <div key={order.id} className="p-6 hover:bg-stone-50 transition-colors">
                          <div className="flex flex-col xl:flex-row justify-between gap-6">
                            <div className="flex-1">
                              <h4 className="font-bold text-stone-800 text-lg mb-1">{order.customer.name}</h4><p className="text-sm text-stone-600 font-medium">{order.deliveryAddress.street}, {order.deliveryAddress.number}</p><p className="text-sm text-stone-500 mb-4">WhatsApp: {order.customer.phone}</p>
                              <div className="bg-stone-100 rounded-xl p-4 inline-block w-full sm:w-auto"><p className="text-xs font-bold text-stone-500 uppercase tracking-wider mb-2">Itens da Caixa</p><ul className="text-sm text-stone-700 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">{order.items.map(i => <li key={i.productId} className="flex gap-2"><span className="font-bold">{i.quantity}x</span> {i.name}</li>)}</ul></div>
                            </div>
                            <div className="flex flex-col lg:items-end w-full xl:w-72 gap-3">
                              <div className={`p-4 rounded-xl border w-full text-center ${order.paymentInfo.method === 'cash' ? 'bg-green-50 border-green-200' : 'bg-blue-50 border-blue-200'}`}><span className="block text-[11px] font-bold uppercase tracking-widest text-stone-500 mb-1">{order.paymentInfo.method === 'cash' ? 'Receber no Local' : 'Pago online'}</span><span className="text-3xl font-bold text-stone-800 block">{formatCurrency(order.totalAmount)}</span>{order.paymentInfo.method === 'cash' && order.paymentInfo.changeFor && (<span className="mt-2 inline-block text-xs font-bold text-green-800 bg-green-200 px-3 py-1 rounded-full">Troco para: {order.paymentInfo.changeFor}</span>)}</div>
                              <div className="w-full flex gap-2">
                                {order.status === 'pending' && <button onClick={() => updateOrderStatus(order.id, 'preparing')} className="w-full bg-stone-800 text-white py-3 rounded-xl text-sm font-bold hover:bg-stone-700 transition-colors">Marcar Separado</button>}
                                {order.status === 'preparing' && <button onClick={() => updateOrderStatus(order.id, 'in_transit')} className="w-full bg-purple-600 text-white py-3 rounded-xl text-sm font-bold hover:bg-purple-700 transition-colors">Pôr no Carro</button>}
                                {order.status === 'in_transit' && <button onClick={() => updateOrderStatus(order.id, 'delivered')} className="w-full bg-[#008c43] text-white py-3 rounded-xl text-sm font-bold hover:bg-[#007035] transition-colors">Finalizar Entrega ✓</button>}
                                {order.status === 'delivered' && <span className="w-full bg-stone-100 text-green-700 py-3 rounded-xl text-sm font-bold text-center border border-stone-200">Finalizado</span>}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {adminTab === 'catalogo' && (
              <div className="space-y-6 animate-in fade-in">
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-stone-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-bold text-stone-800">Catálogo de Produtos</h3>
                    <p className="text-sm text-stone-500">Faça a gestão em massa via Excel ou edite individualmente.</p>
                  </div>
                  <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                    
                    <button onClick={handleExportCSV} disabled={isProcessing} className="flex-1 min-w-[140px] bg-stone-800 text-white px-4 py-2.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 hover:bg-stone-700 transition-colors disabled:opacity-50">
                      <Download size={18} /> Exportar CSV
                    </button>
                    
                    <label className={`flex-1 min-w-[140px] bg-stone-800 text-white px-4 py-2.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 hover:bg-stone-700 transition-colors cursor-pointer ${isProcessing ? 'opacity-50 pointer-events-none' : ''}`}>
                      {isProcessing ? <Loader2 size={18} className="animate-spin" /> : <Upload size={18} />} Importar CSV
                      <input type="file" accept=".csv" className="hidden" onChange={handleImportCSV} disabled={isProcessing} />
                    </label>

                    {!showNewProductForm && (
                      <button onClick={() => { setShowNewProductForm(true); setEditingProductId(null); setNewProduct({ name: '', price: '', unit: 'unidade', category: 'Verduras', imageUrl: '📦' }); setImageFileName(''); }} className="flex-1 min-w-[140px] bg-[#008c43] text-white px-4 py-2.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 hover:bg-[#007035]">
                        <Plus size={18}/> Novo Produto
                      </button>
                    )}
                  </div>
                </div>

                {/* MODAL DE EDIÇÃO / CRIAÇÃO DE PRODUTO */}
                {showNewProductForm && (
                  <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
                    {/* Fundo Escuro */}
                    <div className="absolute inset-0 bg-stone-900/60 backdrop-blur-sm transition-opacity" onClick={handleCancelForm}></div>
                    
                    {/* Conteúdo do Modal */}
                    <div className="relative w-full max-w-2xl bg-[#e6f4ea] rounded-3xl shadow-2xl border border-[#c8e6c9] max-h-[90vh] overflow-hidden flex flex-col animate-in zoom-in-95 fade-in duration-200">
                      
                      {/* Cabeçalho do Modal Fixo */}
                      <div className="bg-[#e6f4ea] border-b border-[#c8e6c9] px-6 py-4 flex justify-between items-center flex-shrink-0 z-10">
                        <h3 className="text-xl font-bold text-green-800 flex items-center gap-2">
                          {editingProductId ? <Edit2 size={20}/> : <Plus size={20}/>}
                          {editingProductId ? 'Editar Produto' : 'Novo Produto'}
                        </h3>
                        <button onClick={handleCancelForm} className="text-green-800 hover:bg-green-200 p-2 rounded-full transition-colors">
                          <X size={24} />
                        </button>
                      </div>

                      {/* Corpo do Modal ROLÁVEL */}
                      <div className="p-6 overflow-y-auto">
                        <form onSubmit={handleAddNewProduct} className="space-y-4 pb-4">
                          
                          <div className="bg-white p-5 rounded-xl border border-green-200 shadow-sm mb-4">
                            <label className="block text-sm font-bold text-green-800 mb-3">Imagem do Produto</label>
                            <div className="flex flex-col sm:flex-row gap-5">
                              <div className="flex-1">
                                <span className="text-xs font-bold text-stone-500 mb-2 block uppercase tracking-wider">Opção 1: Enviar da Galeria</span>
                                <label className={`flex flex-col items-center justify-center w-full h-24 px-4 transition bg-stone-50 border-2 border-dashed rounded-xl cursor-pointer hover:bg-green-50 ${imageFileName ? 'border-green-500' : 'border-stone-300'}`}>
                                    <div className="flex flex-col items-center space-y-1">
                                        <ImagePlus size={24} className={imageFileName ? "text-green-600" : "text-stone-400"} />
                                        <span className="font-bold text-sm text-center line-clamp-1 max-w-full px-2" style={{color: imageFileName ? '#008c43' : '#78716c'}}>
                                            {imageFileName ? imageFileName : 'Clique para selecionar'}
                                        </span>
                                    </div>
                                    <input type="file" className="hidden" accept="image/*" onChange={handleImageSelection} />
                                </label>
                              </div>
                              <div className="flex items-center justify-center py-2 sm:py-0">
                                <span className="text-stone-300 font-extrabold text-sm">OU</span>
                              </div>
                              <div className="flex-1">
                                <span className="text-xs font-bold text-stone-500 mb-2 block uppercase tracking-wider">Opção 2: Emoji Rápido</span>
                                <input type="text" value={newProduct.imageUrl} onChange={e => setNewProduct({...newProduct, imageUrl: e.target.value})} className="w-full h-24 p-4 text-center border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 bg-white shadow-inner text-2xl" placeholder="Ex: 🥬" disabled={!!imageFileName} />
                              </div>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div><label className="block text-sm font-bold text-green-800 mb-1">Nome do Produto</label><input required type="text" value={newProduct.name} onChange={e => setNewProduct({...newProduct, name: e.target.value})} className="w-full p-3 border border-green-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500" placeholder="Ex: Rúcula Fresca" /></div>
                            <div><label className="block text-sm font-bold text-green-800 mb-1">Preço (R$)</label><input required type="number" step="0.01" value={newProduct.price} onChange={e => setNewProduct({...newProduct, price: e.target.value})} className="w-full p-3 border border-green-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500" placeholder="Ex: 4.50" /></div>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div><label className="block text-sm font-bold text-green-800 mb-1">Unidade</label><select value={newProduct.unit} onChange={e => setNewProduct({...newProduct, unit: e.target.value})} className="w-full p-3 border border-green-300 rounded-xl bg-white"><option value="maço">Maço</option><option value="kg">Quilo (kg)</option><option value="unidade">Unidade</option><option value="pacote">Pacote</option><option value="dúzia">Dúzia</option><option value="litro">Litro</option></select></div>
                            <div><label className="block text-sm font-bold text-green-800 mb-1">Categoria</label><select value={newProduct.category} onChange={e => setNewProduct({...newProduct, category: e.target.value})} className="w-full p-3 border border-green-300 rounded-xl bg-white"><option value="Verduras">Verduras</option><option value="Legumes">Legumes</option><option value="Frutas">Frutas</option><option value="Laticínios">Laticínios</option><option value="Mercearia">Mercearia</option><option value="Cestas">Cestas</option><option value="Outros">Outros</option></select></div>
                          </div>
                          <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-green-200 mt-6">
                            <button type="submit" disabled={isProcessing} className="bg-[#008c43] text-white px-8 py-4 rounded-xl font-bold w-full md:w-auto hover:bg-green-800 transition-colors disabled:bg-stone-400 flex items-center justify-center gap-2 text-lg">
                              {isProcessing && <Loader2 size={20} className="animate-spin" />}
                              {isProcessing ? 'A carregar...' : (editingProductId ? 'Atualizar Produto' : 'Guardar no Catálogo')}
                            </button>
                            <button type="button" onClick={handleCancelForm} className="bg-white text-green-800 border border-green-300 px-8 py-4 rounded-xl font-bold hover:bg-green-50 transition-colors w-full md:w-auto">
                              Cancelar
                            </button>
                          </div>
                        </form>
                      </div>
                    </div>
                  </div>
                )}

                {/* AGRUPAMENTO POR CATEGORIA NO ADMIN */}
                <div className="space-y-8">
                  {categories.filter(c => c !== 'Todos').map(category => {
                    const catProducts = products.filter(p => p.category === category);
                    if (catProducts.length === 0) return null;
                    
                    return (
                      <div key={category} className="bg-white p-6 rounded-2xl shadow-sm border border-stone-200">
                        <h4 className="text-xl font-extrabold text-stone-800 mb-6 border-b border-stone-100 pb-3 flex items-center gap-2">
                           <Tags size={20} className="text-[#008c43]"/> {category} 
                           <span className="text-xs font-bold text-stone-400 bg-stone-100 px-2 py-1 rounded-full">{catProducts.length}</span>
                        </h4>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                          {catProducts.map(p => (
                            <div key={p.id} className={`flex items-center p-4 border rounded-xl transition-colors gap-4 shadow-sm ${!p.isActive ? 'bg-stone-50 border-stone-200' : 'bg-white border-stone-200 hover:border-stone-300'}`}>
                              
                              <div className={`w-14 h-14 flex-shrink-0 flex items-center justify-center text-3xl overflow-hidden rounded-xl bg-stone-100 border border-stone-100 ${!p.isActive && 'opacity-40 grayscale'}`}>
                                {isImageValidUrl(p.imageUrl) ? <img src={p.imageUrl} alt={p.name} className="w-full h-full object-cover" /> : <span>{p.imageUrl}</span>}
                              </div>
                              
                              <div className="flex flex-col flex-grow">
                                <span className={`text-sm font-bold leading-tight block ${!p.isActive ? 'text-stone-400 line-through' : 'text-stone-800'}`}>{p.name}</span>
                                <span className="text-xs font-medium text-stone-500 mt-1">{formatCurrency(p.price)} / {p.unit}</span>
                              </div>
                              
                              <div className="flex items-center gap-1 flex-shrink-0 border-l border-stone-100 pl-2">
                                <button onClick={() => handleEditProduct(p)} className="text-stone-400 hover:text-blue-500 transition-colors p-2 hover:bg-blue-50 rounded-lg" title="Editar Produto">
                                  <Edit2 size={16} />
                                </button>
                                <button onClick={() => handleDeleteProduct(p.id)} className="text-stone-400 hover:text-red-500 transition-colors p-2 hover:bg-red-50 rounded-lg" title="Eliminar Produto">
                                  <Trash2 size={16} />
                                </button>
                                <button onClick={() => toggleProductStatus(p.id, p.isActive)} className={`ml-1 w-11 h-6 rounded-full relative transition-colors shadow-inner flex-shrink-0 ${p.isActive ? 'bg-[#008c43]' : 'bg-stone-300'}`}><div className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-all shadow-sm ${p.isActive ? 'left-6' : 'left-1'}`}></div></button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
                
              </div>
            )}
          </div>
        </main>
      </div>
    );
  }

  // ==========================================
  // VISTA DO LOGIN DO ADMIN
  // ==========================================
  if (view === 'adminLogin') {
    return (
      <div className="min-h-screen bg-[#f5f5f5] font-sans flex flex-col">
        <header className="bg-[#005e33] text-white p-4 shadow-sm">
          <div className="container mx-auto flex items-center gap-2 cursor-pointer max-w-5xl" onClick={() => setView('home')}>
            <Leaf size={24} />
            <h1 className="text-lg font-semibold tracking-tight">Clube Orgânicos Izaias</h1>
          </div>
        </header>

        <div className="flex-1 flex items-center justify-center p-4">
          <div className="bg-white p-8 rounded-3xl shadow-lg border border-stone-200 w-full max-w-md animate-in fade-in zoom-in">
            <div className="text-center mb-8">
              <div className="w-16 h-16 bg-stone-100 rounded-full flex items-center justify-center mx-auto mb-4 text-stone-800">
                <ShieldCheck size={32} />
              </div>
              <h2 className="text-2xl font-bold text-stone-800">Acesso Restrito</h2>
              <p className="text-sm text-stone-500 mt-1">Área exclusiva para a gestão da loja.</p>
            </div>

            <form onSubmit={handleAdminLogin} className="space-y-5">
              {loginError && (
                <div className="bg-red-50 text-red-600 p-4 rounded-xl text-sm font-medium text-center border border-red-100">
                  {loginError}
                </div>
              )}
              <div>
                <label className="block text-sm font-bold text-stone-600 mb-2">E-mail</label>
                <input required type="email" value={adminEmail} onChange={e => setAdminEmail(e.target.value)} className="w-full p-4 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-[#008c43] outline-none" placeholder="admin@organicos.com" />
              </div>
              <div>
                <label className="block text-sm font-bold text-stone-600 mb-2">Palavra-passe</label>
                <input required type="password" value={adminPassword} onChange={e => setAdminPassword(e.target.value)} className="w-full p-4 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-[#008c43] outline-none" placeholder="••••••••" />
              </div>
              <button type="submit" disabled={isProcessing} className="w-full bg-[#008c43] text-white py-4 rounded-xl font-bold hover:bg-[#007035] transition-colors mt-2 disabled:bg-stone-400">
                {isProcessing ? 'A iniciar sessão...' : 'Entrar no Painel'}
              </button>
            </form>

            <button onClick={() => setView('home')} className="w-full mt-6 text-stone-500 font-medium text-sm hover:text-stone-800 transition-colors flex items-center justify-center gap-2">
              <ChevronLeft size={16} /> Voltar à Loja
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ==========================================
  // VISTAS DO CLIENTE (LOJA)
  // ==========================================
  return (
    <div className="min-h-screen bg-[#f5f5f5] font-sans flex flex-col">
      {/* CABEÇALHO CLIENTE */}
      <header className="bg-[#005e33] text-white p-4 shadow-sm sticky top-0 z-10 flex-shrink-0">
        <div className="container mx-auto flex flex-col gap-4 max-w-5xl">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2 cursor-pointer" onClick={() => setView('home')}>
              <Leaf size={24} />
              <h1 className="text-lg font-semibold tracking-tight">Clube Orgânicos Izaias</h1>
            </div>
            <div onClick={() => setView('orders')} className="bg-white/10 px-3 py-1.5 rounded-full flex items-center gap-2 cursor-pointer hover:bg-white/20 transition-colors border border-white/10">
              <Package size={16} /> <span className="text-sm font-medium">Meus Pedidos</span>
            </div>
          </div>
          {view === 'home' && (
            <div className="bg-white text-stone-800 text-sm py-2.5 px-3 rounded-lg flex items-center gap-2 font-medium shadow-sm">
              <MapPin size={18} className="text-[#008c43]" /> Entrega em Caraguatatuba e Região
            </div>
          )}
        </div>
      </header>

      <main className="container mx-auto p-4 max-w-5xl mt-2 flex-1">
        
        {/* --- VISTA: VITRINE --- */}
        {view === 'home' && (
          <div className="animate-in fade-in pb-20">

            {/* ALERTA DE REGRAS DE NEGÓCIO */}
            {settings?.cutoffMessage && (
               <div className="bg-orange-50 border border-orange-200 text-orange-800 p-3 rounded-xl mb-4 text-center font-bold text-sm shadow-sm flex flex-col sm:flex-row items-center justify-center gap-2">
                 <div className="flex items-center gap-2"><AlertCircle size={18} /> {settings.cutoffMessage}</div>
                 <span className="hidden sm:inline">•</span>
                 <div>Pedido Mínimo: {formatCurrency(minOrderValue)}</div>
               </div>
            )}

            <div className="flex overflow-x-auto gap-2 pb-4 scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0">
              {categories.map(cat => (
                <button key={cat} onClick={() => setSelectedCategory(cat)} className={`px-5 py-2.5 rounded-full text-sm font-bold whitespace-nowrap border transition-colors shadow-sm ${selectedCategory === cat ? 'bg-[#005e33] text-white border-[#005e33]' : 'bg-white text-stone-600 border-stone-200 hover:bg-stone-50'}`}>
                  {cat}
                </button>
              ))}
            </div>

            {settings && !settings.isOpen && (
               <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 p-4 rounded-2xl mb-4 text-center font-medium shadow-sm">
                 A horta está fechada no momento. Voltamos em breve!
               </div>
            )}

            {products.length === 0 ? (
              <div className="text-center py-20">
                <Leaf size={48} className="mx-auto text-stone-300 mb-4" />
                <p className="text-stone-500 font-medium">O catálogo de produtos será atualizado em breve.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4 mt-2">
                {displayedProducts.map(product => {
                  const cartItem = cart.find(item => item.id === product.id);
                  return (
                    <div key={product.id} className={`bg-white rounded-2xl shadow-sm border border-stone-100 overflow-hidden flex flex-col p-3 ${!settings?.isOpen ? 'opacity-60 pointer-events-none' : ''}`}>
                      <div className="w-full aspect-square bg-stone-50 rounded-xl flex flex-col items-center justify-center overflow-hidden mb-3">
                        {isImageValidUrl(product.imageUrl) ? <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover" /> : <span className="text-6xl">{product.imageUrl}</span>}
                      </div>
                      <div className="flex flex-col flex-grow">
                        <h3 className="text-[13px] sm:text-sm font-bold text-stone-800 leading-snug line-clamp-2">{product.name}</h3>
                        <span className="text-[11px] sm:text-xs text-stone-500 mt-1">{product.description || `Por ${product.unit}`}</span>
                        <div className="mt-auto pt-3">
                          <span className="text-lg sm:text-xl font-extrabold text-stone-900 flex items-baseline gap-1 mb-3">
                            {formatCurrency(product.price)} <span className="text-[10px] font-medium text-stone-400">/{product.unit}</span>
                          </span>
                          
                          {cartItem ? (
                            <div className="w-full flex items-center justify-between bg-[#e6f4ea] border border-[#c8e6c9] rounded-xl h-10 px-1">
                              <button onClick={() => updateQty(product.id, -1)} className="w-8 h-full flex items-center justify-center text-[#008c43]"><Minus size={18} /></button>
                              <span className="font-bold text-[#008c43]">{cartItem.qty}</span>
                              <button onClick={() => updateQty(product.id, 1)} className="w-8 h-full flex items-center justify-center text-[#008c43]"><Plus size={18} /></button>
                            </div>
                          ) : (
                            <button onClick={() => addToCart(product)} className="w-full bg-[#e6f4ea] text-[#008c43] font-bold py-2 rounded-xl text-sm border border-[#c8e6c9] hover:bg-[#d0ebd6] h-10 transition-colors">Adicionar</button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Barra Flutuante Mobile */}
            {cartItemsCount > 0 && (
              <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-stone-200 p-4 pb-6 flex items-center justify-between z-30 shadow-[0_-8px_20px_rgba(0,0,0,0.06)] md:hidden">
                <div className="flex flex-col">
                  <span className="text-[10px] text-stone-500 font-extrabold uppercase tracking-widest">{cartItemsCount} Itens</span>
                  <span className="text-xl font-extrabold text-stone-900">{formatCurrency(cartTotal)}</span>
                </div>
                <button onClick={() => setView('cart')} className="bg-[#008c43] text-white px-6 py-3.5 rounded-xl font-bold text-sm flex items-center gap-2 hover:bg-[#007035] active:scale-95 transition-all shadow-md">
                  Ver Cesta <ChevronRight size={18} />
                </button>
              </div>
            )}
            
            {/* Botão Flutuante Desktop */}
            {cartItemsCount > 0 && (
              <div className="hidden md:block fixed bottom-8 right-8 z-30 animate-in zoom-in">
                <button onClick={() => setView('cart')} className="bg-[#008c43] text-white py-4 px-6 rounded-full shadow-2xl flex items-center gap-4 hover:bg-[#007035] active:scale-95 transition-all">
                  <div className="relative">
                    <ShoppingCart size={24} />
                    <span className="absolute -top-2 -right-2 bg-red-500 text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center border-2 border-[#008c43]">{cartItemsCount}</span>
                  </div>
                  <div className="flex flex-col text-left">
                    <span className="text-xs font-medium text-white/80">Revisar Cesta</span>
                    <span className="font-bold">{formatCurrency(cartTotal)}</span>
                  </div>
                </button>
              </div>
            )}

            {/* Rodapé e Link de Admin */}
            <footer className="mt-16 py-8 text-center text-stone-400 text-xs border-t border-stone-200 w-full">
              <p>© {new Date().getFullYear()} Clube Orgânicos Izaias. Todos os direitos reservados.</p>
              <button onClick={() => setView('adminLogin')} className="mt-4 hover:text-stone-600 transition-colors flex items-center justify-center gap-1 mx-auto">
                <Lock size={12} /> Área Restrita
              </button>
            </footer>
          </div>
        )}

        {/* --- VISTA: CARRINHO --- */}
        {view === 'cart' && (
          <div className="animate-in slide-in-from-right w-full max-w-4xl mx-auto pb-20">
            <button onClick={() => setView('home')} className="flex items-center text-stone-500 hover:text-stone-800 mb-6 font-bold text-sm bg-white px-4 py-2 rounded-full shadow-sm w-fit border border-stone-200"><ChevronLeft size={18} className="mr-1"/> Adicionar mais itens</button>
            <h2 className="text-3xl font-extrabold text-stone-900 mb-6">Sua Cesta</h2>
            
            {cart.length === 0 ? (
              <div className="text-center py-20 bg-white rounded-3xl border border-stone-200 shadow-sm"><ShoppingCart size={64} className="mx-auto text-stone-200 mb-4" /><p className="text-stone-500 font-medium text-lg">Sua cesta está vazia.</p></div>
            ) : (
              <div className="flex flex-col lg:flex-row gap-8">
                <div className="flex-grow bg-white rounded-3xl shadow-sm border border-stone-200 overflow-hidden">
                  {cart.map(item => (
                    <div key={item.id} className="p-5 border-b border-stone-100 flex items-center justify-between gap-4 last:border-0 hover:bg-stone-50 transition-colors">
                      <div className="flex items-center gap-4 w-full sm:w-auto">
                        
                        <div className="w-20 h-20 bg-stone-100 rounded-2xl border border-stone-200 flex items-center justify-center flex-shrink-0 text-4xl overflow-hidden">
                          {isImageValidUrl(item.imageUrl) ? <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" /> : item.imageUrl}
                        </div>

                        <div className="flex-grow">
                          <h4 className="font-bold text-stone-800 text-base">{item.name}</h4>
                          <span className="text-stone-500 font-medium text-sm block mt-1">{formatCurrency(item.price)}</span>
                        </div>
                      </div>
                      <div className="flex items-center flex-col sm:flex-row gap-3">
                        <span className="font-extrabold text-stone-800 text-lg hidden sm:block w-24 text-right">{formatCurrency(item.price * item.qty)}</span>
                        <div className="flex items-center bg-stone-100 border border-stone-200 rounded-xl h-10 w-28">
                          <button onClick={() => updateQty(item.id, -1)} className="w-10 h-full flex items-center justify-center text-stone-600 hover:text-[#008c43]"><Minus size={16} /></button>
                          <span className="flex-grow text-center font-bold text-stone-800">{item.qty}</span>
                          <button onClick={() => updateQty(item.id, 1)} className="w-10 h-full flex items-center justify-center text-stone-600 hover:text-[#008c43]"><Plus size={16} /></button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                
                <div className="w-full lg:w-96 flex-shrink-0">
                  <div className="bg-white rounded-3xl shadow-sm border border-stone-200 p-6 lg:sticky top-24">
                    <h3 className="font-bold text-stone-800 text-lg mb-6 border-b border-stone-100 pb-4">Resumo do Pedido</h3>
                    
                    <div className="flex justify-between items-center text-stone-600 mb-4 font-medium"><span className="text-sm">Produtos ({cartItemsCount})</span><span className="text-sm">{formatCurrency(cartTotal)}</span></div>
                    <div className="flex justify-between items-center text-stone-600 mb-6 border-b border-stone-100 pb-6"><span className="text-sm">Taxa de Entrega</span><span className="text-sm text-[#00a650] font-bold bg-[#e6f4ea] px-2 py-0.5 rounded">Grátis</span></div>
                    <div className="flex justify-between items-center text-stone-900 font-extrabold text-2xl mb-8"><span>Total</span><span>{formatCurrency(cartTotal)}</span></div>
                    
                    {!isMinOrderMet && (
                      <div className="bg-red-50 text-red-700 p-3 rounded-xl text-sm font-bold mb-4 text-center border border-red-100">
                        Faltam {formatCurrency(minOrderValue - cartTotal)} para o pedido mínimo.
                      </div>
                    )}

                    <button onClick={() => { setView('checkout'); setCheckoutStep(1); }} disabled={!isMinOrderMet} className="w-full bg-[#008c43] text-white py-4 rounded-2xl font-bold text-lg hover:bg-[#007035] transition-transform active:scale-95 shadow-md flex justify-center items-center gap-2 disabled:bg-stone-300 disabled:cursor-not-allowed disabled:shadow-none disabled:active:scale-100">
                      Avançar <ChevronRight size={20}/>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* --- VISTA: CHECKOUT (ACORDEÃO / STEPPER OTIMIZADO) --- */}
        {view === 'checkout' && (
          <div className="animate-in slide-in-from-right w-full max-w-4xl mx-auto pb-20">
            <button onClick={() => setView('cart')} className="flex items-center text-stone-500 hover:text-stone-800 mb-6 font-bold text-sm bg-white px-4 py-2 rounded-full shadow-sm w-fit border border-stone-200"><ChevronLeft size={18} className="mr-1"/> Voltar à cesta</button>
            <h2 className="text-3xl font-extrabold text-stone-900 mb-6">Finalização</h2>
            
            <div className="flex flex-col lg:flex-row gap-8">
              
              {/* Acordeão de Passos */}
              <div className="flex-grow space-y-4">
                
                {/* Passo 1: Identificação */}
                <div className={`bg-white rounded-3xl border transition-all ${checkoutStep === 1 ? 'border-[#008c43] shadow-md ring-4 ring-[#e6f4ea]' : 'border-stone-200 shadow-sm'}`}>
                  <div className="p-5 sm:p-6 flex justify-between items-center cursor-pointer" onClick={() => checkoutStep > 1 && setCheckoutStep(1)}>
                    <h3 className={`font-bold text-lg flex items-center gap-3 ${checkoutStep >= 1 ? 'text-stone-800' : 'text-stone-400'}`}>
                      <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm ${checkoutStep === 1 ? 'bg-[#008c43] text-white' : checkoutStep > 1 ? 'bg-stone-800 text-white' : 'bg-stone-200 text-stone-500'}`}>{checkoutStep > 1 ? <CheckCircle2 size={16}/> : '1'}</span>
                      Identificação
                    </h3>
                    {checkoutStep > 1 && <span className="text-[#008c43] text-sm font-bold flex items-center gap-1 hover:underline"><Edit2 size={14}/> Editar</span>}
                  </div>
                  
                  {checkoutStep === 1 && (
                    <div className="px-5 pb-6 sm:px-6 animate-in slide-in-from-top-2">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                        <div><label className="block text-sm font-bold text-stone-600 mb-2">Nome Completo</label><input type="text" name="name" value={checkoutForm.name} onChange={handleFormChange} className="w-full p-4 bg-stone-50 border border-stone-200 rounded-2xl focus:ring-2 focus:ring-[#008c43] outline-none" placeholder="Ex: Maria Silva" /></div>
                        <div><label className="block text-sm font-bold text-stone-600 mb-2">WhatsApp</label><input type="tel" name="phone" value={checkoutForm.phone} onChange={handleFormChange} className="w-full p-4 bg-stone-50 border border-stone-200 rounded-2xl focus:ring-2 focus:ring-[#008c43] outline-none" placeholder="(12) 99999-9999" /></div>
                      </div>
                      <button onClick={() => nextCheckoutStep(2)} className="bg-[#008c43] text-white px-8 py-4 rounded-xl font-bold hover:bg-[#007035] w-full sm:w-auto">Continuar para Entrega</button>
                    </div>
                  )}
                  {checkoutStep > 1 && <div className="px-5 pb-5 sm:px-6 pt-0 text-sm font-medium text-stone-600 ml-11">{checkoutForm.name} • {checkoutForm.phone}</div>}
                </div>

                {/* Passo 2: Endereço */}
                <div className={`bg-white rounded-3xl border transition-all ${checkoutStep === 2 ? 'border-[#008c43] shadow-md ring-4 ring-[#e6f4ea]' : 'border-stone-200 shadow-sm opacity-90'}`}>
                  <div className="p-5 sm:p-6 flex justify-between items-center cursor-pointer" onClick={() => checkoutStep > 2 && setCheckoutStep(2)}>
                    <h3 className={`font-bold text-lg flex items-center gap-3 ${checkoutStep >= 2 ? 'text-stone-800' : 'text-stone-400'}`}>
                      <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm ${checkoutStep === 2 ? 'bg-[#008c43] text-white' : checkoutStep > 2 ? 'bg-stone-800 text-white' : 'bg-stone-200 text-stone-500'}`}>{checkoutStep > 2 ? <CheckCircle2 size={16}/> : '2'}</span>
                      Endereço de Entrega
                    </h3>
                    {checkoutStep > 2 && <span className="text-[#008c43] text-sm font-bold flex items-center gap-1 hover:underline"><Edit2 size={14}/> Editar</span>}
                  </div>
                  
                  {checkoutStep === 2 && (
                    <div className="px-5 pb-6 sm:px-6 animate-in slide-in-from-top-2">
                      <div className="space-y-4 mb-6">
                        <div className="w-full sm:w-1/2"><label className="block text-sm font-bold text-stone-600 mb-2">CEP</label><input type="text" name="zipCode" value={checkoutForm.zipCode} onChange={handleCepChange} className="w-full p-4 bg-stone-50 border border-stone-200 rounded-2xl focus:ring-2 focus:ring-[#008c43] outline-none" placeholder="00000-000" maxLength="9" /></div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4"><div className="md:col-span-2"><label className="block text-sm font-bold text-stone-600 mb-2">Rua / Avenida</label><input type="text" name="street" value={checkoutForm.street} onChange={handleFormChange} className="w-full p-4 bg-stone-50 border border-stone-200 rounded-2xl" /></div><div><label className="block text-sm font-bold text-stone-600 mb-2">Número</label><input type="text" name="number" value={checkoutForm.number} onChange={handleFormChange} className="w-full p-4 bg-stone-50 border border-stone-200 rounded-2xl" /></div></div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4"><div><label className="block text-sm font-bold text-stone-600 mb-2">Bairro</label><input type="text" name="neighborhood" value={checkoutForm.neighborhood} onChange={handleFormChange} className="w-full p-4 bg-stone-50 border border-stone-200 rounded-2xl" /></div><div><label className="block text-sm font-bold text-stone-600 mb-2">Cidade</label><input type="text" name="city" value={checkoutForm.city} onChange={handleFormChange} className="w-full p-4 bg-stone-50 border border-stone-200 rounded-2xl" /></div></div>
                      </div>
                      <button onClick={() => nextCheckoutStep(3)} className="bg-[#008c43] text-white px-8 py-4 rounded-xl font-bold hover:bg-[#007035] w-full sm:w-auto">Continuar para Agendamento</button>
                    </div>
                  )}
                  {checkoutStep > 2 && <div className="px-5 pb-5 sm:px-6 pt-0 text-sm font-medium text-stone-600 ml-11">{checkoutForm.street}, {checkoutForm.number} - {checkoutForm.neighborhood}</div>}
                </div>

                {/* Passo 3: Data */}
                <div className={`bg-white rounded-3xl border transition-all ${checkoutStep === 3 ? 'border-[#008c43] shadow-md ring-4 ring-[#e6f4ea]' : 'border-stone-200 shadow-sm opacity-90'}`}>
                  <div className="p-5 sm:p-6 flex justify-between items-center cursor-pointer" onClick={() => checkoutStep > 3 && setCheckoutStep(3)}>
                    <h3 className={`font-bold text-lg flex items-center gap-3 ${checkoutStep >= 3 ? 'text-stone-800' : 'text-stone-400'}`}>
                      <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm ${checkoutStep === 3 ? 'bg-[#008c43] text-white' : checkoutStep > 3 ? 'bg-stone-800 text-white' : 'bg-stone-200 text-stone-500'}`}>{checkoutStep > 3 ? <CheckCircle2 size={16}/> : '3'}</span>
                      Data de Recebimento
                    </h3>
                    {checkoutStep > 3 && <span className="text-[#008c43] text-sm font-bold flex items-center gap-1 hover:underline"><Edit2 size={14}/> Editar</span>}
                  </div>
                  
                  {checkoutStep === 3 && (
                    <div className="px-5 pb-6 sm:px-6 animate-in slide-in-from-top-2">
                      <div className="grid grid-cols-1 gap-3 mb-6">
                        {settings?.deliveryDays?.filter(d => d.active).map(day => (
                          <label key={day.dayOfWeek} className={`p-5 border-2 rounded-2xl flex items-center cursor-pointer transition-all ${checkoutForm.deliveryDate === day.dayOfWeek ? 'border-[#008c43] bg-[#e6f4ea]' : 'border-stone-100 hover:border-stone-300'}`}>
                            <input type="radio" name="deliveryDate" value={day.dayOfWeek} checked={checkoutForm.deliveryDate === day.dayOfWeek} onChange={handleFormChange} className="mr-3 w-5 h-5 accent-[#008c43] flex-shrink-0" />
                            <span className="font-bold text-stone-800">{day.dayOfWeek}</span>
                          </label>
                        ))}
                      </div>
                      <button onClick={() => nextCheckoutStep(4)} className="bg-[#008c43] text-white px-8 py-4 rounded-xl font-bold hover:bg-[#007035] w-full sm:w-auto">Continuar para Pagamento</button>
                    </div>
                  )}
                  {checkoutStep > 3 && <div className="px-5 pb-5 sm:px-6 pt-0 text-sm font-bold text-stone-800 ml-11">{checkoutForm.deliveryDate}</div>}
                </div>

                {/* Passo 4: Pagamento */}
                <div className={`bg-white rounded-3xl border transition-all ${checkoutStep === 4 ? 'border-[#008c43] shadow-md ring-4 ring-[#e6f4ea]' : 'border-stone-200 shadow-sm opacity-90'}`}>
                  <div className="p-5 sm:p-6 flex justify-between items-center cursor-pointer">
                    <h3 className={`font-bold text-lg flex items-center gap-3 ${checkoutStep === 4 ? 'text-stone-800' : 'text-stone-400'}`}>
                      <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm ${checkoutStep === 4 ? 'bg-[#008c43] text-white' : 'bg-stone-200 text-stone-500'}`}>4</span>
                      Forma de Pagamento
                    </h3>
                  </div>
                  
                  {checkoutStep === 4 && (
                    <div className="px-5 pb-6 sm:px-6 animate-in slide-in-from-top-2">
                      <form id="checkout-form-final" onSubmit={submitOrder}>
                        <div className="space-y-3 mb-6">
                          <label className={`p-5 border-2 rounded-2xl flex items-center cursor-pointer transition-all ${checkoutForm.paymentMethod === 'mercado_pago' ? 'border-[#3483fa] bg-blue-50' : 'border-stone-100 hover:border-stone-300'}`}>
                            <input type="radio" name="paymentMethod" value="mercado_pago" checked={checkoutForm.paymentMethod === 'mercado_pago'} onChange={handleFormChange} className="mr-4 w-5 h-5 accent-[#3483fa]" />
                            <div className="flex flex-col"><span className="font-bold text-stone-800">Pagar online (Mercado Pago)</span><span className="text-sm font-medium text-stone-500">Cartão ou Pix na próxima tela</span></div>
                          </label>
                          <label className={`p-5 border-2 rounded-2xl flex items-center cursor-pointer transition-all ${checkoutForm.paymentMethod === 'cash' ? 'border-[#008c43] bg-[#e6f4ea]' : 'border-stone-100 hover:border-stone-300'}`}>
                            <input type="radio" name="paymentMethod" value="cash" checked={checkoutForm.paymentMethod === 'cash'} onChange={handleFormChange} className="mr-4 w-5 h-5 accent-[#008c43]" />
                            <div className="flex flex-col"><span className="font-bold text-stone-800">Dinheiro na Entrega</span><span className="text-sm font-medium text-stone-500">Pague no recebimento</span></div>
                          </label>
                          {checkoutForm.paymentMethod === 'cash' && (
                            <div className="mt-4 ml-10 p-4 bg-stone-50 rounded-xl border border-stone-200 animate-in fade-in">
                              <label className="block text-sm font-bold text-stone-600 mb-2">Precisa de troco para quanto?</label>
                              <input type="text" name="changeFor" value={checkoutForm.changeFor} onChange={handleFormChange} className="w-full sm:w-64 p-3 bg-white border border-stone-300 rounded-xl outline-none focus:ring-2 focus:ring-[#008c43]" placeholder="Ex: R$ 50,00" required />
                            </div>
                          )}
                        </div>
                      </form>
                    </div>
                  )}
                </div>

              </div>
              
              {/* Sidebar do Checkout (Resumo Fixo) */}
              <div className="w-full lg:w-96 flex-shrink-0">
                <div className="bg-white rounded-3xl shadow-sm border border-stone-200 p-6 lg:sticky top-24">
                  <h3 className="font-bold text-stone-800 text-lg mb-6 border-b border-stone-100 pb-4">Resumo do Pedido</h3>
                  <div className="flex justify-between items-center text-stone-600 mb-4 font-medium"><span className="text-sm">Produtos ({cartItemsCount})</span><span className="text-sm">{formatCurrency(cartTotal)}</span></div>
                  <div className="flex justify-between items-center text-stone-600 mb-6 border-b border-stone-100 pb-6"><span className="text-sm">Taxa de Entrega</span><span className="text-sm text-[#00a650] font-bold bg-[#e6f4ea] px-2 py-0.5 rounded">Grátis</span></div>
                  <div className="flex justify-between items-center text-stone-900 font-extrabold text-2xl mb-8"><span>Total</span><span>{formatCurrency(cartTotal)}</span></div>
                  
                  {!isMinOrderMet && (
                    <div className="bg-red-50 text-red-700 p-3 rounded-xl text-sm font-bold mb-4 text-center border border-red-100">
                      Faltam {formatCurrency(minOrderValue - cartTotal)} para o pedido mínimo.
                    </div>
                  )}

                  <button type="submit" form="checkout-form-final" disabled={isProcessing || checkoutStep !== 4 || !isMinOrderMet} className="w-full bg-[#008c43] text-white py-4 rounded-2xl font-bold text-lg hover:bg-[#007035] transition-transform active:scale-95 shadow-md flex justify-center items-center gap-2 disabled:bg-stone-300 disabled:cursor-not-allowed disabled:shadow-none disabled:active:scale-100">
                    {isProcessing ? 'Processando...' : 'Finalizar Pedido'}
                  </button>
                  {checkoutStep !== 4 && <p className="text-xs text-center text-stone-400 mt-3 font-medium">Preencha os passos anteriores para finalizar.</p>}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* --- VISTA: PEDIDOS DO CLIENTE E SUCESSO --- */}
        {view === 'orders' && !isAdmin && (
          <div className="animate-in slide-in-from-right max-w-2xl mx-auto pb-20">
             <button onClick={() => setView('home')} className="flex items-center text-stone-500 hover:text-stone-800 mb-6 font-bold text-sm bg-white px-4 py-2 rounded-full shadow-sm w-fit border border-stone-200"><ChevronLeft size={18} className="mr-1" /> Voltar às compras</button>
            <h2 className="text-3xl font-extrabold text-stone-900 mb-8 flex items-center gap-3"><Package className="text-[#008c43]" size={32}/> Meus Pedidos</h2>
            {orders.length === 0 ? (
              <div className="text-center py-20 bg-white rounded-3xl border border-stone-200 shadow-sm"><Package size={64} className="mx-auto text-stone-200 mb-4" /><p className="text-stone-500 font-medium text-lg">Você ainda não fez nenhum pedido.</p></div>
            ) : (
              <div className="space-y-6">
                {orders.map(order => {
                  const StatusIcon = statusDict[order.status]?.icon || Clock;
                  return (
                    <div key={order.id} className="bg-white rounded-3xl shadow-sm border border-stone-200 p-6 sm:p-8">
                      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 border-b border-stone-100 pb-6 gap-4">
                        <div><span className="text-sm font-bold text-stone-400 uppercase tracking-widest block mb-1">Pedido #{order.id.slice(0,6).toUpperCase()}</span><span className="font-extrabold text-stone-800 text-lg block">Entrega: {order.deliveryDate}</span></div>
                        <div className={`px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 ${statusDict[order.status]?.color || 'bg-stone-100 text-stone-600'}`}><StatusIcon size={16} /> {statusDict[order.status]?.label || order.status}</div>
                      </div>
                      <div className="mb-6"><p className="text-sm font-bold text-stone-400 uppercase tracking-widest mb-3">Itens Comprados</p><ul className="text-sm text-stone-600 font-medium space-y-2">{order.items.map((item, idx) => (<li key={idx} className="flex gap-2"><span className="text-stone-800 font-bold">{item.quantity}x</span> {item.name}</li>))}</ul></div>
                      <div className="flex justify-between items-center bg-stone-50 p-4 rounded-2xl border border-stone-100"><span className="text-sm font-bold text-stone-500 uppercase tracking-wider">Total Pago</span><span className="font-extrabold text-[#008c43] text-xl">{formatCurrency(order.totalAmount)}</span></div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* --- VISTA: SUCESSO --- */}
        {view === 'success' && (
          <div className="animate-in zoom-in max-w-md mx-auto text-center pt-20 pb-20">
            <div className="w-24 h-24 bg-[#008c43] text-white rounded-full flex items-center justify-center mx-auto mb-8 shadow-xl shadow-green-900/20"><CheckCircle2 size={48} /></div>
            <h2 className="text-3xl font-extrabold text-stone-900 mb-4">Pedido Realizado!</h2>
            <p className="text-stone-600 mb-10 text-lg font-medium">Tudo certo! Seus orgânicos fresquinhos serão entregues na próxima <strong>{checkoutForm.deliveryDate}</strong>.</p>
            <div className="flex flex-col gap-4">
              <button onClick={() => { setView('orders'); setCheckoutForm(prev => ({ ...prev, name: '', phone: '', zipCode: '', street: '', number: '', neighborhood: '', city: '', state: '', changeFor: '' })); }} className="bg-[#008c43] text-white px-8 py-4 rounded-2xl font-bold text-lg hover:bg-[#007035] transition-transform active:scale-95 shadow-md w-full">
                Acompanhar meu Pedido
              </button>
              <button onClick={() => { setView('home'); setCheckoutForm(prev => ({ ...prev, name: '', phone: '', zipCode: '', street: '', number: '', neighborhood: '', city: '', state: '', changeFor: '' })); }} className="bg-white text-stone-700 border border-stone-200 px-8 py-4 rounded-2xl font-bold text-lg hover:bg-stone-50 transition-colors w-full">
                Voltar ao Início
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
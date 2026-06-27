import React, { useState, useEffect, useMemo } from 'react';
import { 
  ShoppingCart, Leaf, MapPin, Calendar, 
  CreditCard, Banknote, ChevronLeft, ChevronRight, Plus, Minus, CheckCircle2,
  Store, Search, User, Package, Clock, Truck, ShieldCheck, Map, ListChecks, Tags, BarChart3, TrendingUp
} from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from 'firebase/auth';
import { getFirestore, collection, addDoc, onSnapshot, doc, setDoc, getDocs, updateDoc } from 'firebase/firestore';

// --- CONFIGURAÇÃO FIREBASE ---
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

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
  const [adminTab, setAdminTab] = useState('roteiro'); // colheita, roteiro, catalogo, dashboard
  const [adminDateFilter, setAdminDateFilter] = useState('');
  
  // Novo Produto Form
  const [showNewProductForm, setShowNewProductForm] = useState(false);
  const [newProduct, setNewProduct] = useState({ name: '', price: '', unit: 'unidade', category: 'Verduras', imageUrl: '📦' });

  // Estados do Checkout
  const [checkoutForm, setCheckoutForm] = useState({
    name: '', phone: '', zipCode: '', street: '', number: '', neighborhood: '', city: '', state: '',
    deliveryDate: '', paymentMethod: 'cash', changeFor: ''
  });

  // --- AUTENTICAÇÃO ---
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (error) { console.error("Erro na autenticação:", error); }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  // --- MOCK INICIAL ---
  const seedDatabase = async () => {
    const productsRef = collection(db, 'artifacts', appId, 'public', 'data', 'products');
    const settingsRef = collection(db, 'artifacts', appId, 'public', 'data', 'settings');
    
    const productsSnap = await getDocs(productsRef);
    if (productsSnap.empty) {
      const mockProducts = [
        { name: "Alface Crespa Fresca", price: 3.50, unit: "maço", category: "Verduras", imageUrl: "🥬", isActive: true },
        { name: "Tomate Orgânico 1Kg", price: 8.00, unit: "kg", category: "Legumes", imageUrl: "🍅", isActive: true },
        { name: "Cenoura com Rama", price: 6.50, unit: "maço", category: "Legumes", imageUrl: "🥕", isActive: true },
        { name: "Batata Doce Orgânica 1Kg", price: 5.50, unit: "kg", category: "Legumes", imageUrl: "🍠", isActive: true },
        { name: "Maçã Fuji 1Kg", price: 12.00, unit: "kg", category: "Frutas", imageUrl: "🍎", isActive: true },
        { name: "Cesta Completa da Semana", price: 45.00, unit: "unidade", category: "Cestas", imageUrl: "🧺", description: "Seleção variada", isActive: true }
      ];
      for (const prod of mockProducts) await addDoc(productsRef, prod);
    }

    const settingsSnap = await getDocs(settingsRef);
    if (settingsSnap.empty) {
      await setDoc(doc(settingsRef, 'store_config'), {
        isOpen: true,
        deliveryDays: [{ dayOfWeek: "Terça-feira", active: true }, { dayOfWeek: "Sexta-feira", active: true }]
      });
    }
  };

  // --- BUSCA DE DADOS (FIRESTORE) ---
  useEffect(() => {
    if (!user) return;
    seedDatabase().then(() => {
      const productsRef = collection(db, 'artifacts', appId, 'public', 'data', 'products');
      const unsubProducts = onSnapshot(productsRef, (snapshot) => {
        setProducts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        setLoading(false);
      });

      const settingsRef = collection(db, 'artifacts', appId, 'public', 'data', 'settings');
      const unsubSettings = onSnapshot(settingsRef, (snapshot) => {
        const configDoc = snapshot.docs.find(doc => doc.id === 'store_config');
        if (configDoc) {
          setSettings(configDoc.data());
          const activeDays = configDoc.data().deliveryDays.filter(d => d.active);
          if (activeDays.length > 0) {
            setCheckoutForm(prev => ({ ...prev, deliveryDate: activeDays[0].dayOfWeek }));
            if(!adminDateFilter) setAdminDateFilter(activeDays[0].dayOfWeek); 
          }
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
    });
  }, [user]);

  // --- LÓGICA DO CARRINHO ---
  const addToCart = (product) => setCart(prev => prev.find(i => i.id === product.id) ? prev.map(i => i.id === product.id ? { ...i, qty: i.qty + 1 } : i) : [...prev, { ...product, qty: 1 }]);
  const updateQty = (id, delta) => setCart(prev => prev.map(i => i.id === id ? { ...i, qty: i.qty + delta } : i).filter(i => i.qty > 0));
  const cartTotal = useMemo(() => cart.reduce((sum, item) => sum + (item.price * item.qty), 0), [cart]);
  const cartItemsCount = useMemo(() => cart.reduce((sum, item) => sum + item.qty, 0), [cart]);

  const categories = useMemo(() => ['Todos', ...new Set(products.map(p => p.category))], [products]);
  const displayedProducts = useMemo(() => products.filter(p => p.isActive && (selectedCategory === 'Todos' || p.category === selectedCategory)), [products, selectedCategory]);

  // --- INTELIGÊNCIA LOGÍSTICA (ADMIN) ---
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

  // --- KPIs DASHBOARD ---
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

  // --- LÓGICA DE CHECKOUT, PRODUTOS E API ---
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

  const submitOrder = async (e) => {
    e.preventDefault();
    if (!user) return;
    setIsProcessing(true);
    try {
      const orderData = {
        userId: user.uid,
        customer: { name: checkoutForm.name, phone: checkoutForm.phone },
        items: cart.map(item => ({ productId: item.id, name: item.name, price: item.price, quantity: item.qty })),
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
      setView('success');
    } catch (error) { alert("Erro ao processar pedido."); } 
    finally { setIsProcessing(false); }
  };

  const updateOrderStatus = async (orderId, newStatus) => {
    try { await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'orders', orderId), { status: newStatus }); } 
    catch (error) { console.error("Erro ao atualizar pedido", error); }
  };

  const toggleProductStatus = async (productId, currentStatus) => {
    try { await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'products', productId), { isActive: !currentStatus }); } 
    catch (error) { console.error("Erro ao atualizar produto", error); }
  };

  const handleAddNewProduct = async (e) => {
    e.preventDefault();
    if (!newProduct.name || !newProduct.price) return;
    try {
      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'products'), {
        ...newProduct,
        price: parseFloat(newProduct.price),
        isActive: true,
        updatedAt: new Date().toISOString()
      });
      setNewProduct({ name: '', price: '', unit: 'unidade', category: 'Verduras', imageUrl: '📦' });
      setShowNewProductForm(false);
    } catch (error) {
      console.error("Erro ao adicionar produto:", error);
    }
  };

  // --- RENDERIZAÇÃO CONDICIONAL ---
  if (loading) return <div className="min-h-screen flex items-center justify-center bg-[#f5f5f5] text-[#008c43]">Carregando app...</div>;

  return (
    <div className="min-h-screen bg-[#f5f5f5] font-sans pb-28">
      {/* CABEÇALHO */}
      <header className={`${isAdmin ? 'bg-stone-800' : 'bg-[#005e33]'} text-white p-4 shadow-sm sticky top-0 z-10 transition-colors`}>
        <div className="container mx-auto flex flex-col gap-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2 cursor-pointer" onClick={() => setView('home')}>
              {isAdmin ? <ShieldCheck size={24} className="text-orange-400" /> : <Leaf size={24} />}
              <h1 className="text-lg font-semibold tracking-tight">
                {isAdmin ? 'Central Logística & Admin' : 'Clube Orgânicos Izaias'}
              </h1>
            </div>
            
            <div className="flex gap-3">
              {!isAdmin && (
                <div onClick={() => setView('orders')} className="bg-white/20 px-3 py-1.5 rounded-full flex items-center gap-2 cursor-pointer hover:bg-white/30 transition-colors">
                  <Package size={18} />
                  <span className="text-sm font-medium">Meus Pedidos</span>
                </div>
              )}
            </div>
          </div>
          
          {view === 'home' && !isAdmin && (
            <div className="bg-white text-stone-800 text-sm py-2 px-3 rounded-md flex items-center gap-2 font-medium w-full sm:w-80 shadow-sm">
              <MapPin size={16} className="text-[#008c43]" /> Entrega em Caraguatatuba e Região
            </div>
          )}
        </div>
      </header>

      <main className="container mx-auto p-4 max-w-5xl mt-2">
        
        {/* --- VISTA: VITRINE (HOME) --- */}
        {view === 'home' && !isAdmin && (
          <div className="animate-in fade-in">
            <div className="flex overflow-x-auto gap-2 pb-4 scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0">
              {categories.map(cat => (
                <button key={cat} onClick={() => setSelectedCategory(cat)} className={`px-5 py-2 rounded-full text-sm font-semibold whitespace-nowrap border transition-colors ${selectedCategory === cat ? 'bg-[#005e33] text-white border-[#005e33]' : 'bg-white text-stone-600 border-stone-300 hover:bg-stone-50'}`}>
                  {cat}
                </button>
              ))}
            </div>

            {settings && !settings.isOpen && (
               <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 p-4 rounded-xl mb-4 text-center font-medium">
                 A horta está fechada no momento. Os pedidos estão pausados.
               </div>
            )}

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4 mt-2">
              {displayedProducts.map(product => {
                const cartItem = cart.find(item => item.id === product.id);
                return (
                  <div key={product.id} className={`bg-white rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.04)] border border-stone-100 overflow-hidden flex flex-col p-3 hover:shadow-md transition-shadow ${!settings?.isOpen ? 'opacity-60 pointer-events-none' : ''}`}>
                    <div className="w-full aspect-square bg-stone-50 rounded-xl flex flex-col items-center justify-center overflow-hidden mb-3">
                      {product.imageUrl?.startsWith('http') ? <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover" /> : <span className="text-6xl">{product.imageUrl}</span>}
                    </div>
                    <div className="flex flex-col flex-grow">
                      <h3 className="text-[13px] sm:text-sm font-semibold text-[#444] leading-snug line-clamp-2">{product.name}</h3>
                      <span className="text-[11px] sm:text-xs text-stone-500 mt-1 line-clamp-1">{product.description || `Vendido por ${product.unit}`}</span>
                      <div className="mt-auto pt-2">
                        <span className="text-lg sm:text-xl font-bold text-[#222] flex items-baseline gap-1 mb-3">
                          {formatCurrency(product.price)} <span className="text-[10px] sm:text-xs font-normal text-stone-400">/{product.unit}</span>
                        </span>
                        
                        {cartItem ? (
                          <div className="w-full flex items-center justify-between bg-[#e6f4ea] border border-[#c8e6c9] rounded-lg h-10 px-1">
                            <button onClick={() => updateQty(product.id, -1)} className="w-8 h-full flex items-center justify-center text-[#008c43]"><Minus size={18} /></button>
                            <span className="font-bold text-[#008c43]">{cartItem.qty}</span>
                            <button onClick={() => updateQty(product.id, 1)} className="w-8 h-full flex items-center justify-center text-[#008c43]"><Plus size={18} /></button>
                          </div>
                        ) : (
                          <button onClick={() => addToCart(product)} className="w-full bg-[#e6f4ea] text-[#008c43] font-bold py-2 rounded-lg text-sm border border-[#c8e6c9] hover:bg-[#d0ebd6] h-10">Adicionar</button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {cartItemsCount > 0 && (
              <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-stone-200 p-4 pb-6 flex items-center justify-between z-30 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] md:hidden">
                <div className="flex flex-col">
                  <span className="text-[11px] text-stone-500 font-bold uppercase tracking-wider">{cartItemsCount} ITENS NA CESTA</span>
                  <span className="text-xl font-bold text-[#005e33] leading-tight">{formatCurrency(cartTotal)}</span>
                </div>
                <button onClick={() => setView('cart')} className="bg-[#008c43] text-white px-5 py-3 rounded-lg font-bold text-sm flex items-center gap-2 hover:bg-[#007035] active:scale-95 shadow-sm">
                  Revisar <ChevronRight size={18} />
                </button>
              </div>
            )}
            
            {cartItemsCount > 0 && (
              <div className="hidden md:block fixed bottom-8 right-8 z-30 animate-in zoom-in">
                <button onClick={() => setView('cart')} className="bg-[#008c43] text-white py-4 px-6 rounded-full shadow-xl flex items-center gap-4 hover:bg-[#007035] active:scale-95 transition-all">
                  <div className="relative">
                    <ShoppingCart size={24} />
                    <span className="absolute -top-2 -right-2 bg-red-500 text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center border-2 border-[#008c43]">{cartItemsCount}</span>
                  </div>
                  <div className="flex flex-col text-left">
                    <span className="text-xs font-medium text-white/80">Revisar Pedido</span>
                    <span className="font-bold">{formatCurrency(cartTotal)}</span>
                  </div>
                </button>
              </div>
            )}
          </div>
        )}

        {/* --- VISTAS CLIENTE (CARRINHO, CHECKOUT, PEDIDOS E SUCESSO) MANTIDAS IGUAIS --- */}
        {view === 'orders' && !isAdmin && (
          <div className="animate-in slide-in-from-right max-w-2xl mx-auto">
             <button onClick={() => setView('home')} className="flex items-center text-[#008c43] mb-6 font-semibold hover:underline text-sm"><ChevronLeft size={16} /> Voltar às compras</button>
            <h2 className="text-2xl font-bold text-[#333] mb-6 flex items-center gap-2"><Package className="text-[#008c43]" /> Meus Pedidos</h2>
            {orders.length === 0 ? (
              <div className="text-center py-16 bg-white rounded-2xl border border-stone-200"><Package size={64} className="mx-auto text-stone-200 mb-4" /><p className="text-stone-500 font-medium">Você ainda não fez nenhum pedido.</p></div>
            ) : (
              <div className="space-y-4">
                {orders.map(order => {
                  const StatusIcon = statusDict[order.status]?.icon || Clock;
                  return (
                    <div key={order.id} className="bg-white rounded-2xl shadow-sm border border-stone-100 p-5">
                      <div className="flex justify-between items-start mb-4 border-b border-stone-100 pb-4">
                        <div><span className="text-xs text-stone-500 block mb-1">Pedido #{order.id.slice(0,6).toUpperCase()}</span><span className="font-semibold text-stone-800 block">Entrega: {order.deliveryDate}</span></div>
                        <div className={`px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 ${statusDict[order.status]?.color || 'bg-stone-100 text-stone-600'}`}><StatusIcon size={14} /> {statusDict[order.status]?.label || order.status}</div>
                      </div>
                      <div className="mb-4"><p className="text-sm font-medium text-stone-600 mb-2">Itens:</p><ul className="text-sm text-stone-500 space-y-1">{order.items.map((item, idx) => (<li key={idx}>{item.quantity}x {item.name}</li>))}</ul></div>
                      <div className="flex justify-between items-center bg-stone-50 p-3 rounded-xl"><span className="text-sm text-stone-600">Total Pago:</span><span className="font-bold text-[#008c43]">{formatCurrency(order.totalAmount)}</span></div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {view === 'cart' && (
          <div className="animate-in slide-in-from-right w-full">
            <button onClick={() => setView('home')} className="flex items-center text-[#008c43] mb-6 font-semibold hover:underline text-sm"><ChevronLeft size={16} /> Voltar aos produtos</button>
            <h2 className="text-2xl font-bold text-[#333] mb-4">Sua Cesta</h2>
            {cart.length === 0 ? (
              <div className="text-center py-16 bg-white rounded-2xl border border-stone-200"><ShoppingCart size={64} className="mx-auto text-stone-200 mb-4" /><p className="text-stone-500 font-medium text-lg">Sua cesta está vazia.</p></div>
            ) : (
              <div className="flex flex-col md:flex-row gap-6">
                <div className="flex-grow bg-white rounded-2xl shadow-sm border border-stone-100 overflow-hidden">
                  {cart.map(item => (
                    <div key={item.id} className="p-4 border-b border-stone-50 flex items-center justify-between gap-4 last:border-0">
                      <div className="flex items-center gap-4 w-full sm:w-auto"><div className="w-16 h-16 bg-stone-50 rounded-xl border border-stone-100 flex items-center justify-center flex-shrink-0 text-3xl">{item.imageUrl}</div><div className="flex-grow"><h4 className="font-semibold text-[#333] text-sm leading-tight">{item.name}</h4><span className="text-[#008c43] font-semibold text-sm block mt-1">{formatCurrency(item.price)}</span></div></div>
                      <div className="flex items-center flex-col sm:flex-row gap-2 sm:gap-6"><div className="flex items-center bg-[#e6f4ea] rounded-lg h-9 w-24"><button onClick={() => updateQty(item.id, -1)} className="w-8 h-full flex items-center justify-center text-[#008c43]"><Minus size={14} /></button><span className="flex-grow text-center font-bold text-sm text-[#008c43]">{item.qty}</span><button onClick={() => updateQty(item.id, 1)} className="w-8 h-full flex items-center justify-center text-[#008c43]"><Plus size={14} /></button></div></div>
                    </div>
                  ))}
                </div>
                <div className="w-full md:w-80 flex-shrink-0"><div className="bg-white rounded-2xl shadow-sm border border-stone-100 p-6"><div className="flex justify-between items-center text-[#333] mb-4"><span className="text-sm font-medium">Subtotal</span><span className="text-sm font-bold">{formatCurrency(cartTotal)}</span></div><div className="flex justify-between items-center text-[#333] mb-6 border-b border-stone-100 pb-4"><span className="text-sm font-medium">Frete</span><span className="text-sm text-[#00a650] font-bold">Grátis</span></div><div className="flex justify-between items-center text-[#333] font-bold text-lg mb-6"><span>Total</span><span>{formatCurrency(cartTotal)}</span></div><button onClick={() => setView('checkout')} className="w-full bg-[#008c43] text-white py-3.5 rounded-xl font-bold hover:bg-[#007035] transition-colors">Continuar para o Pagamento</button></div></div>
              </div>
            )}
          </div>
        )}

        {view === 'checkout' && (
          <div className="animate-in slide-in-from-right w-full">
            {/* Mantido igual ao anterior para focar no admin */}
            <button onClick={() => setView('cart')} className="flex items-center text-[#008c43] mb-6 font-semibold hover:underline text-sm"><ChevronLeft size={16} /> Voltar à cesta</button>
            <h2 className="text-2xl font-bold text-[#333] mb-6">Finalizar Pedido</h2>
            <div className="flex flex-col md:flex-row gap-6">
              <div className="flex-grow">
                <form id="checkout-form" onSubmit={submitOrder} className="space-y-4">
                  <div className="bg-white p-6 rounded-2xl shadow-sm border border-stone-100"><h3 className="font-semibold text-lg text-[#333] mb-4">1. Seus Dados</h3><div className="grid grid-cols-1 md:grid-cols-2 gap-4"><div><label className="block text-sm font-medium text-stone-600 mb-1">Nome</label><input required type="text" name="name" value={checkoutForm.name} onChange={handleFormChange} className="w-full p-3 bg-stone-50 border rounded-xl" /></div><div><label className="block text-sm font-medium text-stone-600 mb-1">WhatsApp</label><input required type="tel" name="phone" value={checkoutForm.phone} onChange={handleFormChange} className="w-full p-3 bg-stone-50 border rounded-xl" /></div></div></div>
                  <div className="bg-white p-6 rounded-2xl shadow-sm border border-stone-100"><h3 className="font-semibold text-lg text-[#333] mb-4">2. Endereço</h3><div className="space-y-4"><div className="w-full sm:w-1/3"><label className="block text-sm font-medium text-stone-600 mb-1">CEP</label><input required type="text" name="zipCode" value={checkoutForm.zipCode} onChange={handleCepChange} className="w-full p-3 bg-stone-50 border rounded-xl" maxLength="9" /></div><div className="grid grid-cols-1 md:grid-cols-3 gap-4"><div className="md:col-span-2"><label className="block text-sm font-medium text-stone-600 mb-1">Rua</label><input required type="text" name="street" value={checkoutForm.street} onChange={handleFormChange} className="w-full p-3 bg-stone-50 border rounded-xl" /></div><div><label className="block text-sm font-medium text-stone-600 mb-1">Número</label><input required type="text" name="number" value={checkoutForm.number} onChange={handleFormChange} className="w-full p-3 bg-stone-50 border rounded-xl" /></div></div><div className="grid grid-cols-1 md:grid-cols-3 gap-4"><div><label className="block text-sm font-medium text-stone-600 mb-1">Bairro</label><input required type="text" name="neighborhood" value={checkoutForm.neighborhood} onChange={handleFormChange} className="w-full p-3 bg-stone-50 border rounded-xl" /></div><div><label className="block text-sm font-medium text-stone-600 mb-1">Cidade</label><input required type="text" name="city" value={checkoutForm.city} onChange={handleFormChange} className="w-full p-3 bg-stone-50 border rounded-xl" /></div><div><label className="block text-sm font-medium text-stone-600 mb-1">Estado</label><input required type="text" name="state" value={checkoutForm.state} onChange={handleFormChange} className="w-full p-3 bg-stone-50 border rounded-xl" maxLength="2" /></div></div></div></div>
                  {settings?.deliveryDays && (<div className="bg-white p-6 rounded-2xl shadow-sm border border-stone-100"><h3 className="font-semibold text-lg text-[#333] mb-4">3. Data de Recebimento</h3><div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{settings.deliveryDays.filter(d => d.active).map(day => (<label key={day.dayOfWeek} className={`p-4 border rounded-xl flex items-center cursor-pointer ${checkoutForm.deliveryDate === day.dayOfWeek ? 'border-[#008c43] bg-[#e6f4ea]' : ''}`}><input type="radio" name="deliveryDate" value={day.dayOfWeek} checked={checkoutForm.deliveryDate === day.dayOfWeek} onChange={handleFormChange} className="mr-3 w-4 h-4 text-[#008c43]" /><span className="font-medium">{day.dayOfWeek}</span></label>))}</div></div>)}
                  <div className="bg-white p-6 rounded-2xl shadow-sm border border-stone-100"><h3 className="font-semibold text-lg text-[#333] mb-4">4. Forma de Pagamento</h3><div className="space-y-3"><label className={`p-4 border rounded-xl flex items-center cursor-pointer ${checkoutForm.paymentMethod === 'mercado_pago' ? 'border-[#3483fa] bg-blue-50/50' : ''}`}><input type="radio" name="paymentMethod" value="mercado_pago" checked={checkoutForm.paymentMethod === 'mercado_pago'} onChange={handleFormChange} className="mr-3 w-4 h-4 text-[#3483fa]" /><div className="flex flex-col"><span className="font-medium">Pagar online (Mercado Pago)</span></div></label><label className={`p-4 border rounded-xl flex items-center cursor-pointer ${checkoutForm.paymentMethod === 'cash' ? 'border-[#008c43] bg-[#e6f4ea]' : ''}`}><input type="radio" name="paymentMethod" value="cash" checked={checkoutForm.paymentMethod === 'cash'} onChange={handleFormChange} className="mr-3 w-4 h-4 text-[#008c43]" /><div className="flex flex-col"><span className="font-medium">Dinheiro na entrega</span></div></label>{checkoutForm.paymentMethod === 'cash' && (<div className="mt-3 ml-7"><label className="block text-sm font-medium mb-1">Troco para quanto?</label><input type="text" name="changeFor" value={checkoutForm.changeFor} onChange={handleFormChange} className="w-48 p-3 text-sm bg-stone-50 border rounded-xl" placeholder="Ex: R$ 50,00" required /></div>)}</div></div>
                </form>
              </div>
              <div className="w-full md:w-80 flex-shrink-0"><div className="bg-white rounded-2xl shadow-sm border border-stone-100 p-6 sticky top-24"><h3 className="font-semibold text-[#333] mb-4 border-b pb-2">Resumo</h3><div className="flex justify-between mb-3"><span className="text-sm">Produtos</span><span className="text-sm">{formatCurrency(cartTotal)}</span></div><div className="flex justify-between font-bold text-xl mb-6"><span>Total</span><span>{formatCurrency(cartTotal)}</span></div><button type="submit" form="checkout-form" disabled={isProcessing} className="w-full bg-[#008c43] text-white py-4 rounded-xl font-bold">{isProcessing ? 'Processando...' : 'Confirmar compra'}</button></div></div>
            </div>
          </div>
        )}

        {view === 'success' && (
          <div className="animate-in zoom-in max-w-md mx-auto text-center pt-16">
            <div className="w-20 h-20 bg-[#008c43] text-white rounded-full flex items-center justify-center mx-auto mb-6"><CheckCircle2 size={40} /></div>
            <h2 className="text-2xl font-bold mb-2">Pedido Realizado!</h2>
            <p className="text-stone-500 mb-8">Entrega na próxima <strong>{checkoutForm.deliveryDate}</strong>.</p>
            <button onClick={() => setView('orders')} className="bg-[#008c43] text-white px-8 py-4 rounded-xl font-bold w-full mb-3">Acompanhar meu Pedido</button>
            <button onClick={() => setView('home')} className="bg-stone-200 text-stone-700 px-8 py-4 rounded-xl font-bold w-full">Voltar ao Início</button>
          </div>
        )}

        {/* --- VISTA: PAINEL ADMIN (SR IZAIAS) --- */}
        {view === 'admin' && isAdmin && (
          <div className="animate-in fade-in max-w-4xl mx-auto">
            
            {/* 1. Barra de Filtro (Escondida no Dashboard e Catálogo para focar na métrica global) */}
            {['colheita', 'roteiro'].includes(adminTab) && (
              <div className="bg-white p-4 rounded-xl shadow-sm border border-stone-200 mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-bold text-stone-800">Logística de Entrega</h2>
                  <p className="text-sm text-stone-500">Planeje sua colheita e roteiro.</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-stone-600">Data:</span>
                  <select 
                    value={adminDateFilter} onChange={(e) => setAdminDateFilter(e.target.value)}
                    className="bg-stone-50 border border-stone-200 text-stone-800 font-bold py-2 px-4 rounded-lg focus:outline-none"
                  >
                    {settings?.deliveryDays.map(d => <option key={d.dayOfWeek} value={d.dayOfWeek}>{d.dayOfWeek}</option>)}
                  </select>
                </div>
              </div>
            )}

            {/* 2. Menu de Abas (Tabs) */}
            <div className="flex flex-wrap bg-stone-200 p-1 rounded-xl mb-6 gap-1">
              <button onClick={() => setAdminTab('dashboard')} className={`flex-1 min-w-[120px] flex items-center justify-center gap-2 py-2.5 text-sm font-bold rounded-lg transition-all ${adminTab === 'dashboard' ? 'bg-white text-stone-800 shadow-sm' : 'text-stone-500 hover:text-stone-700'}`}>
                <BarChart3 size={18} /> KPIs (Resumo)
              </button>
              <button onClick={() => setAdminTab('colheita')} className={`flex-1 min-w-[120px] flex items-center justify-center gap-2 py-2.5 text-sm font-bold rounded-lg transition-all ${adminTab === 'colheita' ? 'bg-white text-stone-800 shadow-sm' : 'text-stone-500 hover:text-stone-700'}`}>
                <ListChecks size={18} /> Colheita
              </button>
              <button onClick={() => setAdminTab('roteiro')} className={`flex-1 min-w-[120px] flex items-center justify-center gap-2 py-2.5 text-sm font-bold rounded-lg transition-all ${adminTab === 'roteiro' ? 'bg-white text-stone-800 shadow-sm' : 'text-stone-500 hover:text-stone-700'}`}>
                <Map size={18} /> Roteiro
              </button>
              <button onClick={() => setAdminTab('catalogo')} className={`flex-1 min-w-[120px] flex items-center justify-center gap-2 py-2.5 text-sm font-bold rounded-lg transition-all ${adminTab === 'catalogo' ? 'bg-white text-stone-800 shadow-sm' : 'text-stone-500 hover:text-stone-700'}`}>
                <Tags size={18} /> Catálogo
              </button>
            </div>

            {/* ABA: DASHBOARD / KPIS */}
            {adminTab === 'dashboard' && (
              <div className="space-y-6 animate-in fade-in">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Card Faturamento */}
                  <div className="bg-white p-6 rounded-2xl shadow-sm border border-stone-200 flex items-center gap-4">
                    <div className="bg-green-100 p-4 rounded-full text-green-700"><TrendingUp size={32} /></div>
                    <div>
                      <p className="text-sm font-medium text-stone-500">Faturamento Global</p>
                      <h3 className="text-3xl font-bold text-stone-800">{formatCurrency(dashboardKPIs.totalRevenue)}</h3>
                    </div>
                  </div>
                  
                  {/* Card Pedidos Totais */}
                  <div className="bg-white p-6 rounded-2xl shadow-sm border border-stone-200 flex items-center gap-4">
                    <div className="bg-blue-100 p-4 rounded-full text-blue-700"><Package size={32} /></div>
                    <div>
                      <p className="text-sm font-medium text-stone-500">Total de Pedidos</p>
                      <h3 className="text-3xl font-bold text-stone-800">{dashboardKPIs.totalOrders}</h3>
                    </div>
                  </div>
                </div>

                {/* Card Vendas por Cidade */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-stone-200">
                  <h3 className="text-lg font-bold text-stone-800 mb-4 border-b pb-2">Vendas por Cidade</h3>
                  {Object.keys(dashboardKPIs.citySales).length === 0 ? (
                    <p className="text-stone-500 text-sm">Ainda não há dados suficientes.</p>
                  ) : (
                    <div className="space-y-3">
                      {Object.entries(dashboardKPIs.citySales)
                        .sort((a, b) => b[1] - a[1]) // Ordena da maior para a menor
                        .map(([city, count]) => (
                        <div key={city} className="flex justify-between items-center">
                          <span className="font-medium text-stone-700">{city}</span>
                          <span className="bg-stone-100 text-stone-800 px-3 py-1 rounded-full text-sm font-bold">{count} pedidos</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ABA: LISTA DE COLHEITA */}
            {adminTab === 'colheita' && (
              <div className="bg-white rounded-2xl shadow-sm border border-stone-200 overflow-hidden animate-in fade-in">
                <div className="bg-green-50 p-4 border-b border-green-100 flex items-center justify-between">
                  <h3 className="font-bold text-green-800 flex items-center gap-2"><Leaf size={20}/> Total a colher para {adminDateFilter}</h3>
                  <span className="bg-green-200 text-green-800 py-1 px-3 rounded-full text-xs font-bold">{adminFilteredOrders.length} Pedidos</span>
                </div>
                {harvestList.length === 0 ? (
                  <p className="p-8 text-center text-stone-500">Nenhum pedido para esta data ainda.</p>
                ) : (
                  <ul className="divide-y divide-stone-100">
                    {harvestList.map((item, idx) => (
                      <li key={idx} className="p-4 flex items-center justify-between hover:bg-stone-50">
                        <span className="font-medium text-stone-700 text-lg">{item.name}</span>
                        <span className="font-bold text-2xl text-green-700 bg-green-100 w-16 h-12 flex items-center justify-center rounded-xl">{item.quantity}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {/* ABA: ROTEIRO POR BAIRRO */}
            {adminTab === 'roteiro' && (
              <div className="space-y-6 animate-in fade-in">
                {Object.keys(ordersByNeighborhood).length === 0 && (
                  <p className="text-center py-8 text-stone-500 bg-white rounded-2xl border border-stone-200">Nenhum pedido para montar roteiro.</p>
                )}
                {Object.keys(ordersByNeighborhood).sort().map(neighborhood => (
                  <div key={neighborhood} className="bg-white rounded-2xl shadow-sm border border-stone-200 overflow-hidden">
                    <div className="bg-stone-100 p-4 border-b border-stone-200 flex justify-between items-center"><h3 className="font-bold text-stone-800 flex items-center gap-2 text-lg"><MapPin size={20} className="text-orange-500"/> {neighborhood}</h3><span className="text-sm font-bold text-stone-500">{ordersByNeighborhood[neighborhood].length} entregas</span></div>
                    <div className="divide-y divide-stone-100">
                      {ordersByNeighborhood[neighborhood].map(order => (
                        <div key={order.id} className="p-5 hover:bg-stone-50">
                          <div className="flex flex-col md:flex-row justify-between gap-4">
                            <div className="flex-1">
                              <h4 className="font-bold text-stone-800 text-lg">{order.customer.name}</h4><p className="text-sm text-stone-600 mt-1">{order.deliveryAddress.street}, {order.deliveryAddress.number}</p><p className="text-sm text-stone-500 mb-3">WhatsApp: {order.customer.phone}</p>
                              <div className="bg-stone-100 rounded-lg p-3 inline-block"><p className="text-xs font-bold text-stone-500 mb-1">Itens:</p><ul className="text-sm text-stone-700">{order.items.map(i => <li key={i.productId}>- {i.quantity}x {i.name}</li>)}</ul></div>
                            </div>
                            <div className="flex flex-col md:items-end w-full md:w-64 gap-3">
                              <div className={`p-3 rounded-xl border w-full text-center ${order.paymentInfo.method === 'cash' ? 'bg-green-50 border-green-200' : 'bg-blue-50 border-blue-200'}`}><span className="block text-xs font-bold uppercase mb-1">{order.paymentInfo.method === 'cash' ? 'Receber Dinheiro' : 'Mercado Pago'}</span><span className="text-2xl font-bold block">{formatCurrency(order.totalAmount)}</span></div>
                              <div className="w-full flex gap-2">
                                {order.status === 'pending' && <button onClick={() => updateOrderStatus(order.id, 'preparing')} className="w-full bg-stone-800 text-white py-2 rounded-lg text-sm font-bold">Marcar Separado</button>}
                                {order.status === 'preparing' && <button onClick={() => updateOrderStatus(order.id, 'in_transit')} className="w-full bg-purple-600 text-white py-2 rounded-lg text-sm font-bold">Pôr no Carro</button>}
                                {order.status === 'in_transit' && <button onClick={() => updateOrderStatus(order.id, 'delivered')} className="w-full bg-green-600 text-white py-2 rounded-lg text-sm font-bold">Entregue ✓</button>}
                                {order.status === 'delivered' && <span className="w-full bg-stone-100 text-green-700 py-2 rounded-lg text-sm font-bold text-center">Finalizado</span>}
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

            {/* ABA: CATÁLOGO */}
            {adminTab === 'catalogo' && (
              <div className="space-y-6 animate-in fade-in">
                
                {/* Cabeçalho Catálogo */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-stone-200 flex justify-between items-center">
                  <div>
                    <h3 className="text-lg font-bold text-stone-800">Catálogo de Produtos</h3>
                    <p className="text-sm text-stone-500">Pause produtos em falta ou adicione novos.</p>
                  </div>
                  <button 
                    onClick={() => setShowNewProductForm(!showNewProductForm)}
                    className="bg-[#008c43] text-white px-4 py-2 rounded-lg font-bold text-sm flex items-center gap-2 hover:bg-[#007035]"
                  >
                    {showNewProductForm ? 'Cancelar' : <><Plus size={16}/> Novo Produto</>}
                  </button>
                </div>

                {/* Formulário de Novo Produto */}
                {showNewProductForm && (
                  <div className="bg-[#e6f4ea] p-6 rounded-2xl border border-[#c8e6c9] animate-in slide-in-from-top-4">
                    <form onSubmit={handleAddNewProduct} className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-bold text-green-800 mb-1">Nome do Produto</label>
                          <input required type="text" value={newProduct.name} onChange={e => setNewProduct({...newProduct, name: e.target.value})} className="w-full p-2 border border-green-300 rounded focus:outline-none focus:ring-2 focus:ring-green-500" placeholder="Ex: Rúcula Fresca" />
                        </div>
                        <div>
                          <label className="block text-sm font-bold text-green-800 mb-1">Preço (R$)</label>
                          <input required type="number" step="0.01" value={newProduct.price} onChange={e => setNewProduct({...newProduct, price: e.target.value})} className="w-full p-2 border border-green-300 rounded focus:outline-none focus:ring-2 focus:ring-green-500" placeholder="Ex: 4.50" />
                        </div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                          <label className="block text-sm font-bold text-green-800 mb-1">Unidade</label>
                          <select value={newProduct.unit} onChange={e => setNewProduct({...newProduct, unit: e.target.value})} className="w-full p-2 border border-green-300 rounded focus:outline-none bg-white">
                            <option value="maço">Maço</option>
                            <option value="kg">Quilo (kg)</option>
                            <option value="unidade">Unidade</option>
                            <option value="bandeja">Bandeja</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-bold text-green-800 mb-1">Categoria</label>
                          <select value={newProduct.category} onChange={e => setNewProduct({...newProduct, category: e.target.value})} className="w-full p-2 border border-green-300 rounded focus:outline-none bg-white">
                            <option value="Verduras">Verduras</option>
                            <option value="Legumes">Legumes</option>
                            <option value="Frutas">Frutas</option>
                            <option value="Cestas">Cestas</option>
                            <option value="Outros">Outros</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-bold text-green-800 mb-1">Emoji / Ícone</label>
                          <input required type="text" value={newProduct.imageUrl} onChange={e => setNewProduct({...newProduct, imageUrl: e.target.value})} className="w-full p-2 border border-green-300 rounded focus:outline-none" placeholder="Ex: 🥬" />
                        </div>
                      </div>
                      <button type="submit" className="bg-green-700 text-white px-6 py-2 rounded-lg font-bold w-full md:w-auto hover:bg-green-800">
                        Salvar Produto na Loja
                      </button>
                    </form>
                  </div>
                )}

                {/* Lista de Produtos (Ativar/Desativar) */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-stone-200">
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                    {products.map(p => (
                      <div key={p.id} className={`flex items-center justify-between p-4 border rounded-xl transition-colors ${!p.isActive ? 'bg-stone-50 border-stone-200' : 'border-stone-300'}`}>
                        <div className="flex items-center gap-3">
                          <span className={`text-2xl ${!p.isActive && 'opacity-50 grayscale'}`}>{p.imageUrl}</span>
                          <div>
                            <span className={`text-sm font-medium pr-2 block ${!p.isActive && 'text-stone-400 line-through'}`}>{p.name}</span>
                            <span className="text-xs text-stone-500">{formatCurrency(p.price)}</span>
                          </div>
                        </div>
                        <button onClick={() => toggleProductStatus(p.id, p.isActive)} className={`w-12 h-6 rounded-full relative transition-colors ${p.isActive ? 'bg-green-500' : 'bg-stone-300'}`}>
                          <div className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-all ${p.isActive ? 'left-7' : 'left-1'}`}></div>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

          </div>
        )}

      </main>

      {/* --- BOTÃO FLUTUANTE EXCLUSIVO PARA O DESENVOLVEDOR TESTAR --- */}
      <div className="fixed bottom-24 left-4 z-50 md:bottom-8 md:left-8">
        <button 
          onClick={() => { const next = !isAdmin; setIsAdmin(next); setView(next ? 'admin' : 'home'); }}
          className="bg-orange-500 text-white text-xs font-bold px-4 py-2 rounded-full shadow-lg border-2 border-white hover:bg-orange-600 transition-colors opacity-80 hover:opacity-100"
        >
          {isAdmin ? 'Voltar para Cliente' : 'Simular Visão Admin'}
        </button>
      </div>
    </div>
  );
}
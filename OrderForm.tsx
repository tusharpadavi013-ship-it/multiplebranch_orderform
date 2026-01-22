
import React, { useState, useEffect } from 'react';
import { Search, User, Mail, Phone, Plus, Check, Loader2, Trash2, Package, Truck, Hash, ReceiptText } from 'lucide-react';
import { supabase } from '../../services/supabase.ts';
import { submitToGoogleSheets } from '../../services/googleSheets.ts';
import { toast } from 'react-hot-toast';
import { OrderItem, Order } from '../../types.ts';
import { BRANCHES, BRANCH_SALES_PERSONS, CATEGORIES, UOMS } from '../../constants.ts';

// Mapping UI Category labels to your Supabase DB column/value standards
const CATEGORY_DB_MAP: Record<string, string> = {
  'CKU': 'cku',
  'CRO': 'cro',
  'CUP': 'cup',
  'ELASTIC': 'elastic',
  'EMBROIDARY': 'embroidary',
  'EYE_N_HOOK': 'eye_n_hook',
  'PRINTING': 'printing',
  'TLU': 'tlu',
  'VAU': 'vau',
  'WARP(UDHANA)': 'warp'
};

export const OrderForm: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [branch, setBranch] = useState('');
  const [salesPerson, setSalesPerson] = useState('');
  const [customerPONo, setCustomerPONo] = useState('');

  const [customerSearch, setCustomerSearch] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerContact, setCustomerContact] = useState('');
  const [billingAddress, setBillingAddress] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [accountStatus, setAccountStatus] = useState('');
  const [customers, setCustomers] = useState<any[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<boolean>(false);

  const [currentItem, setCurrentItem] = useState({
    category: '', 
    itemName: '',
    manualItem: false,
    color: '',
    width: '',
    uom: '',
    quantity: '' as string,
    rate: '' as string,
    discount: '' as string,
    deliveryDate: new Date().toISOString().split('T')[0],
    transportName: '',
    remark: ''
  });
  
  const [items, setItems] = useState<OrderItem[]>([]);
  const [itemSearch, setItemSearch] = useState('');
  const [suggestedProducts, setSuggestedProducts] = useState<any[]>([]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSearchingCustomer, setIsSearchingCustomer] = useState(false);
  const [isSearchingProduct, setIsSearchingProduct] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setCurrentUser(user);
        if (user.user_metadata?.branch) {
          setBranch(user.user_metadata.branch);
        }
      }
    });
  }, []);

  // Customer Search logic
  useEffect(() => {
    const searchCustomers = async () => {
      if (customerSearch.length < 1 || selectedCustomer) {
        setCustomers([]);
        return;
      }
      setIsSearchingCustomer(true);
      try {
        let query = supabase.from('customers').select('*').ilike('customer_name', `%${customerSearch}%`);
        if (branch) query = query.eq('branch', branch);
        const { data, error } = await query.limit(10);
        if (error) throw error;
        setCustomers(data || []);
      } catch (e) {
        console.error('Customer Search Error:', e);
      } finally {
        setIsSearchingCustomer(false);
      }
    };
    const timer = setTimeout(searchCustomers, 300);
    return () => clearTimeout(timer);
  }, [customerSearch, branch, selectedCustomer]);

  // FIXED: Robust Item Search logic. Specifically searches within the selected Unit/Category.
  useEffect(() => {
    const fetchProducts = async () => {
      if (!currentItem.category) {
        setSuggestedProducts([]);
        return;
      }
      setIsSearchingProduct(true);
      try {
        // Map WARP(UDHANA) to 'warp', CKU to 'cku', etc.
        const dbCategoryValue = CATEGORY_DB_MAP[currentItem.category] || currentItem.category.toLowerCase();
        
        let query = supabase.from('products').select('*');
        
        // Match against your DB columns 'unit' or 'category' using fuzzy search
        query = query.or(`unit.ilike.%${dbCategoryValue}%,category.ilike.%${dbCategoryValue}%,unit.ilike.%${currentItem.category}%,category.ilike.%${currentItem.category}%`);

        if (itemSearch.trim().length > 0) {
          query = query.ilike('name', `%${itemSearch}%`);
        }

        const { data, error } = await query.order('name', { ascending: true }).limit(50);
        if (error) throw error;
        
        setSuggestedProducts(data || []);
      } catch (e) {
        console.error('Product Search Error:', e);
      } finally {
        setIsSearchingProduct(false);
      }
    };
    
    // Trigger search immediately if category changes, or after delay if typing
    const timer = setTimeout(fetchProducts, itemSearch.length > 0 ? 300 : 0);
    return () => clearTimeout(timer);
  }, [itemSearch, currentItem.category]);

  const onSelectCustomer = (c: any) => {
    setCustomerSearch(c.customer_name);
    setCustomerEmail(c.email_id || '');
    setCustomerContact(c.mob_no || '');
    const foundAddress = c.address || c.billing_address || c.full_address || c.customer_address || '';
    setBillingAddress(foundAddress);
    setDeliveryAddress(''); 
    setAccountStatus(c.account_status || 'Active');
    setSelectedCustomer(true);
    setCustomers([]);
  };

  const onSelectProduct = (product: any) => {
    const dbCat = CATEGORY_DB_MAP[currentItem.category] || currentItem.category.toLowerCase();
    
    // Automatically fill width based on your specific DB column names
    // (e.g. width_cku, width-cku, warp_width, etc.)
    const autoWidth = 
      product[`width_${dbCat}`] || 
      product[`width-${dbCat}`] || 
      product[`width_${dbCat.replace('_', '-')}`] ||
      product[`${dbCat}_width`] ||
      product.width || 
      '';

    setCurrentItem({
      ...currentItem,
      itemName: product.name,
      width: String(autoWidth),
      uom: product.uom || currentItem.uom 
    });
    setItemSearch(product.name);
    setSuggestedProducts([]);
  };

  const addItemToPreview = () => {
    const finalItemName = currentItem.manualItem ? itemSearch : currentItem.itemName;
    
    if (!currentItem.category) {
      toast.error('Select Unit Name first');
      return;
    }
    if (!finalItemName) {
      toast.error('Item name is required');
      return;
    }
    if (!currentItem.uom) {
      toast.error('Select UOM');
      return;
    }
    if (!currentItem.quantity || !currentItem.rate) {
      toast.error('Enter Qty and Rate');
      return;
    }

    const qty = Number(currentItem.quantity);
    const rate = Number(currentItem.rate);
    const disc = Number(currentItem.discount) || 0;

    const newItem: OrderItem = {
      id: crypto.randomUUID(),
      category: currentItem.category,
      itemName: finalItemName,
      manualItem: currentItem.manualItem,
      color: currentItem.color,
      width: currentItem.width,
      uom: currentItem.uom,
      quantity: qty,
      rate: rate,
      discount: disc,
      deliveryDate: currentItem.deliveryDate,
      transportName: currentItem.transportName,
      remark: currentItem.remark,
      total: (qty * rate) * (1 - (disc / 100))
    };

    setItems([...items, newItem]);
    setItemSearch('');
    setCurrentItem({
      ...currentItem,
      itemName: '',
      manualItem: false,
      color: '',
      width: '',
      uom: '',
      quantity: '',
      rate: '',
      discount: '',
      transportName: '',
      remark: ''
    });
    toast.success('Item added to preview');
  };

  const handleSubmitOrder = async () => {
    if (!customerSearch || !branch || !salesPerson || items.length === 0) {
      toast.error('Please complete all mandatory fields.');
      return;
    }
    setIsSubmitting(true);
    const order: Order = {
      id: `GINZA-${Date.now().toString().slice(-6)}`,
      orderDate: new Date().toLocaleDateString('en-GB'),
      branch, // This value (e.g., 'Mumbai') tells the Google Sheet which tab to use
      salesPerson,
      customerPONo,
      customer: { id: '', name: customerSearch, email: customerEmail, contact_no: customerContact, address: billingAddress },
      billingAddress,
      deliveryAddress,
      accountStatus,
      items,
      timestamp: Date.now()
    };

    const success = await submitToGoogleSheets(order);
    if (success) {
      const history = JSON.parse(localStorage.getItem('ginza_order_history') || '[]');
      localStorage.setItem('ginza_order_history', JSON.stringify([order, ...history]));
      toast.success('Order Synced Successfully!');
      setItems([]);
      setCustomerPONo('');
      setCustomerSearch('');
      setCustomerEmail('');
      setCustomerContact('');
      setBillingAddress('');
      setDeliveryAddress('');
      setAccountStatus('');
      setSelectedCustomer(false);
    } else {
      toast.error('Failed to sync. Please check your Google Script URL.');
    }
    setIsSubmitting(false);
  };

  return (
    <div className="space-y-6 pb-24 max-w-6xl mx-auto">
      {/* 01. Sales Identification */}
      <section className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2 mb-6">
          <Hash className="h-4 w-4" /> 01. Sales Identification
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Branch Name*</label>
            <select 
              value={branch}
              onChange={(e) => { setBranch(e.target.value); setSalesPerson(''); setSelectedCustomer(false); }}
              className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-slate-50 font-bold cursor-pointer"
            >
              <option value="">-- Select Branch --</option>
              {BRANCHES.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Sales Person Name*</label>
            <select 
              value={salesPerson}
              onChange={(e) => { setSalesPerson(e.target.value); setSelectedCustomer(false); }}
              disabled={!branch}
              className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 outline-none disabled:bg-slate-50 font-bold cursor-pointer"
            >
              <option value="">-- Select Sales Person --</option>
              {branch && BRANCH_SALES_PERSONS[branch]?.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Customer PO No</label>
            <input
              type="text"
              value={customerPONo}
              onChange={(e) => setCustomerPONo(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
              placeholder="PO No..."
            />
          </div>
        </div>
      </section>

      {/* 02. Customer Selection */}
      <section className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2 mb-6">
          <User className="h-4 w-4" /> 02. Customer Selection
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="relative">
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Search Customer Name*</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={customerSearch}
                onChange={(e) => { setCustomerSearch(e.target.value); setSelectedCustomer(false); }}
                className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none font-bold"
                placeholder="Start typing customer name..."
              />
              {isSearchingCustomer && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-indigo-500" />}
            </div>
            {customers.length > 0 && (
              <div className="absolute z-30 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-2xl max-h-60 overflow-y-auto">
                {customers.map(c => (
                  <button key={c.id} onClick={() => onSelectCustomer(c)} className="w-full px-4 py-3 text-left hover:bg-slate-50 border-b last:border-0 border-slate-100 flex flex-col">
                    <span className="font-bold text-sm text-slate-900">{c.customer_name}</span>
                    <span className="text-[10px] text-slate-400 uppercase font-bold">{c.mob_no || 'No Contact'}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Contact No</label>
              <input type="text" value={customerContact} onChange={(e) => setCustomerContact(e.target.value)} className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-medium" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Email ID</label>
              <input type="email" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-medium" />
            </div>
          </div>

          <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Billing Address</label>
              <textarea value={billingAddress} onChange={(e) => setBillingAddress(e.target.value)} className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm h-24 resize-none font-medium text-slate-600" placeholder="Billing address..." />
            </div>
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="text-xs font-bold text-slate-500 uppercase">Delivery Address</label>
                <button onClick={() => setDeliveryAddress(billingAddress)} className="text-[10px] font-black text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-lg uppercase tracking-widest hover:bg-indigo-100 transition-colors">Same as Billing</button>
              </div>
              <textarea value={deliveryAddress} onChange={(e) => setDeliveryAddress(e.target.value)} className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm h-24 resize-none font-medium text-slate-600" placeholder="Enter delivery address..." />
            </div>
          </div>

          <div className="md:col-span-2">
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Account Status</label>
            <input type="text" value={accountStatus} onChange={(e) => setAccountStatus(e.target.value)} className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-700 bg-slate-50" />
          </div>
        </div>
      </section>

      {/* 03. Item Entry */}
      <section className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2 mb-6">
          <Package className="h-4 w-4" /> 03. Item Entry
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Select Unit Name*</label>
            <select 
              value={currentItem.category} 
              onChange={(e) => {
                setCurrentItem({...currentItem, category: e.target.value, itemName: '', width: ''});
                setItemSearch('');
              }} 
              className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-slate-50 font-black cursor-pointer"
            >
              <option value="">-- Select Unit --</option>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div className="md:col-span-2 relative">
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5 flex items-center gap-2">
              Item Name Selection*
            </label>
            <div className="relative">
              <input 
                type="text" 
                value={itemSearch} 
                onChange={(e) => setItemSearch(e.target.value)} 
                className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold focus:ring-2 focus:ring-indigo-500 outline-none" 
                placeholder={currentItem.category ? `Search ${currentItem.category} items...` : "Select Unit Name first..."} 
                disabled={!currentItem.category}
              />
              {isSearchingProduct && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-slate-400" />}
            </div>
            {!currentItem.manualItem && suggestedProducts.length > 0 && (
              <div className="absolute z-20 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-48 overflow-y-auto ring-1 ring-slate-200">
                {suggestedProducts.map(p => (
                  <button key={p.id} onClick={() => onSelectProduct(p)} className="w-full px-4 py-3 text-left hover:bg-slate-50 border-b last:border-0 border-slate-100 text-sm font-bold text-slate-700 transition-colors">
                    <div className="flex justify-between items-center">
                      <span>{p.name}</span>
                      <span className="text-[10px] text-slate-400 uppercase font-black">{p.category || p.unit}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
            {currentItem.category && itemSearch.length > 0 && suggestedProducts.length === 0 && !isSearchingProduct && !currentItem.manualItem && (
               <div className="absolute z-20 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl p-4 text-center ring-1 ring-slate-200">
                 <p className="text-xs text-slate-400 font-bold uppercase">No matching products.</p>
               </div>
            )}
            <div className="mt-2 flex items-center gap-2">
              <input type="checkbox" id="manual-item" checked={currentItem.manualItem} onChange={(e) => setCurrentItem({...currentItem, manualItem: e.target.checked})} className="rounded text-indigo-600 h-4 w-4" />
              <label htmlFor="manual-item" className="text-[10px] font-black text-slate-400 uppercase tracking-widest cursor-pointer select-none">Allow Manual Entry</label>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">UOM*</label>
            <select 
              value={currentItem.uom} 
              onChange={(e) => setCurrentItem({...currentItem, uom: e.target.value})} 
              className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-normal text-slate-600 bg-white cursor-pointer"
            >
              <option value="">-- Unit --</option>
              {UOMS.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase tracking-tighter">Color</label>
              <input type="text" value={currentItem.color} onChange={(e) => setCurrentItem({...currentItem, color: e.target.value})} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm font-medium" placeholder="Red, Blue..." />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase tracking-tighter">Width</label>
              <input 
                type="text" 
                value={currentItem.width} 
                onChange={(e) => setCurrentItem({...currentItem, width: e.target.value})} 
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-indigo-50/50 font-medium" 
                placeholder="Auto..." 
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Qty*</label>
              <input type="number" value={currentItem.quantity} onChange={(e) => setCurrentItem({...currentItem, quantity: e.target.value})} className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Rate*</label>
              <input type="number" value={currentItem.rate} onChange={(e) => setCurrentItem({...currentItem, rate: e.target.value})} className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Discount %</label>
            <input type="number" value={currentItem.discount} onChange={(e) => setCurrentItem({...currentItem, discount: e.target.value})} className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-600" placeholder="0" />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Delivery Date</label>
            <input type="date" value={currentItem.deliveryDate} onChange={(e) => setCurrentItem({...currentItem, deliveryDate: e.target.value})} className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-600" />
          </div>

          <div className="md:col-span-2">
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5 flex items-center gap-1"><Truck className="h-3 w-3" /> Transporter Name</label>
            <input type="text" value={currentItem.transportName} onChange={(e) => setCurrentItem({...currentItem, transportName: e.target.value})} className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-600" />
          </div>

          <div className="md:col-span-2">
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Remark</label>
            <input type="text" value={currentItem.remark} onChange={(e) => setCurrentItem({...currentItem, remark: e.target.value})} className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-600" />
          </div>

          <div className="md:col-span-4 flex justify-end pt-2">
            <button 
              onClick={addItemToPreview}
              className="flex items-center gap-2 px-10 py-3 bg-slate-900 text-white rounded-xl text-sm font-black hover:bg-slate-800 shadow-xl transition-all active:scale-95"
            >
              <Plus className="h-4 w-4" /> Add Item to Preview
            </button>
          </div>
        </div>
      </section>

      {/* Preview Section */}
      {items.length > 0 && (
        <div className="space-y-6 animate-in slide-in-from-bottom-6 duration-500">
          <section className="bg-white rounded-3xl border-2 border-slate-200 shadow-2xl overflow-hidden">
            <div className="bg-slate-900 px-8 py-5 flex justify-between items-center">
              <h3 className="text-white font-black text-sm uppercase tracking-[0.2em] flex items-center gap-3">
                <ReceiptText className="h-5 w-5 text-indigo-400" /> Current Order Preview
              </h3>
              <span className="bg-indigo-600 text-white px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest">
                {items.length} Items
              </span>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    <th className="px-8 py-4">Item Details</th>
                    <th className="px-8 py-4">Specs</th>
                    <th className="px-8 py-4 text-right">Qty/Rate</th>
                    <th className="px-8 py-4 text-right">Total</th>
                    <th className="px-8 py-4 text-center">Delete</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map(i => (
                    <tr key={i.id} className="text-xs hover:bg-slate-50 transition-colors">
                      <td className="px-8 py-5">
                        <p className="font-black text-slate-900 text-sm leading-tight">{i.itemName}</p>
                        <p className="text-[10px] font-bold text-indigo-600 uppercase mt-1 tracking-wider">{i.category}</p>
                      </td>
                      <td className="px-8 py-5 text-slate-500">
                        <p className="font-bold">{i.color || 'STD'} | {i.width || 'STD'}</p>
                        <p className="text-[10px] uppercase font-black">{i.uom}</p>
                      </td>
                      <td className="px-8 py-5 text-right font-bold text-slate-700">
                        <p>{i.quantity} @ ₹{i.rate}</p>
                        {i.discount > 0 && <p className="text-emerald-600 text-[10px] font-black">-{i.discount}% Off</p>}
                      </td>
                      <td className="px-8 py-5 text-right font-black text-slate-900 text-base">
                        ₹{i.total.toLocaleString()}
                      </td>
                      <td className="px-8 py-5 text-center">
                        <button onClick={() => setItems(items.filter(x => x.id !== i.id))} className="p-2.5 text-slate-300 hover:text-red-600 hover:bg-red-50 rounded-full transition-all">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-indigo-50/30">
                  <tr>
                    <td colSpan={3} className="px-8 py-6 text-right text-xs font-black uppercase tracking-widest text-slate-500">Gross Total</td>
                    <td className="px-8 py-6 text-right font-black text-slate-900 text-2xl tracking-tighter">
                      ₹{items.reduce((sum, item) => sum + item.total, 0).toLocaleString()}
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>

          <div className="flex justify-center md:justify-end pb-12 pt-4">
            <button
              onClick={handleSubmitOrder}
              disabled={isSubmitting}
              className="flex items-center gap-6 px-16 py-6 bg-indigo-600 text-white rounded-3xl shadow-2xl hover:bg-indigo-700 hover:-translate-y-1 active:scale-95 transition-all disabled:opacity-50 group"
            >
              {isSubmitting ? (
                <Loader2 className="h-6 w-6 animate-spin" />
              ) : (
                <p className="text-2xl font-black uppercase tracking-tight">Submit & Review</p>
              )}
              <div className="bg-white/20 p-2.5 rounded-2xl group-hover:bg-white/30 transition-colors">
                <Check className="h-8 w-8" />
              </div>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

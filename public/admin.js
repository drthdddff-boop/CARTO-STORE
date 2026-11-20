const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function api(url, opts={}) {
  const token = localStorage.getItem('carto_admin_token') || '';
  const headers = {...(opts.headers || {}), ...(token ? {Authorization:`Bearer ${token}`} : {})};
  if (opts.body && typeof opts.body === 'string') headers['Content-Type'] = 'application/json';
  const res = await fetch(url, {...opts, headers});
  const text = await res.text();
  let data = {}; try { data = text ? JSON.parse(text) : {}; } catch { data = {error:text || `HTTP ${res.status}`}; }
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}
function showDash(){ $('loginBox').hidden=true; $('dashboard').hidden=false; loadOrders(); loadProducts(); }
async function checkAdmin(){ try { const d=await api('/api/admin/me'); if(d.admin) showDash(); } catch {} }
if ($('loginForm')) $('loginForm').onsubmit = async e => {
  e.preventDefault(); const button=e.submitter; if(button) button.disabled=true;
  try { const d=await api('/api/admin/login',{method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(e.target)))}); if(d.token) localStorage.setItem('carto_admin_token',d.token); showDash(); }
  catch(err){ $('loginError').textContent=err.message; }
  finally { if(button) button.disabled=false; }
};
if ($('logout')) $('logout').onclick = async()=>{try{await api('/api/admin/logout',{method:'POST'});}catch{} localStorage.removeItem('carto_admin_token');location.reload();};
async function loadOrders(){ try { const orders=await api('/api/admin/orders'); $('orders').innerHTML=orders.length?orders.map(o=>`<article class="product" style="padding:18px;margin:12px 0"><div class="product-row"><b>${esc(o.order_code)}</b><b>₹${Number(o.total).toLocaleString('en-IN')}</b></div><p>${esc(o.customer_name)} · ${esc(o.phone)} · ${esc(o.email)}</p><p class="muted">${esc(o.address)}</p><p>${(o.items||[]).map(i=>esc(i.name)+' × '+i.qty+' (Size '+esc(i.size)+')').join('<br>')}</p><p>Current: <b>${esc(o.status)}</b> · Payment: ${esc(o.payment_method)}</p><div style="display:flex;gap:8px;flex-wrap:wrap"><select id="status-${o.id}">${['Order Confirmed','Processing','Packed','Shipped','Out for Delivery','Delivered','Cancelled'].map(s=>`<option ${s===o.status?'selected':''}>${s}</option>`).join('')}</select><input id="tracking-${o.id}" placeholder="Courier tracking number" value="${esc(o.tracking_number||'')}" style="background:#0b0a14;color:white;border:1px solid #ffffff22;padding:8px"><button type="button" class="add" onclick="updateOrder(${o.id})">Update & email customer</button></div></article>`).join(''):'<p class="muted">No orders yet.</p>'; } catch(err){ $('orders').textContent=err.message; } }
window.updateOrder=async id=>{try{await api('/api/admin/orders/'+id,{method:'PATCH',body:JSON.stringify({status:$('status-'+id).value,trackingNumber:$('tracking-'+id).value})});alert('Order updated. Customer email sent if SMTP is configured.');loadOrders();}catch(err){alert(err.message)}};
if ($('productForm')) $('productForm').onsubmit=async e=>{
  e.preventDefault(); const form=e.target, button=form.querySelector('button[type="submit"],button:not([type])'); if(button){button.disabled=true;button.textContent='Saving product…';}
  try{
    const fd=new FormData(form), d=Object.fromEntries(fd);
    const file=fd.get('imageFile');
    d.image=String(fd.get('imageUrl')||fd.get('image')||'');
    if(file instanceof File && file.size){
      if(file.size>5*1024*1024) throw new Error('Please use an image under 5 MB.');
      d.image=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('Could not read the image file.'));reader.readAsDataURL(file);});
    }
    d.price=Number(d.price); d.stock=Number(d.stock||0); d.sizes=String(d.sizes||'').split(',').map(x=>x.trim()).filter(Boolean);
    delete d.imageFile; delete d.imageUrl;
    const saved=await api('/api/admin/products',{method:'POST',body:JSON.stringify(d)});
    form.reset(); await loadProducts(); alert(`Product added${saved.name?`: ${saved.name}`:''}!`);
  }catch(err){alert('Could not add product: '+err.message);}
  finally{if(button){button.disabled=false;button.textContent='Add product';}}
};
async function loadProducts(){try{const products=await api('/api/products');$('adminProducts').innerHTML=products.map(p=>`<div class="cart-line"><span>${esc(p.name)} · ${esc(p.category)} · ₹${p.price} · Stock ${p.stock}</span><button type="button" onclick="deleteProduct(${p.id})">Delete</button></div>`).join('');}catch(err){$('adminProducts').textContent=err.message;}}
window.deleteProduct=async id=>{if(!confirm('Delete this product?'))return;try{await api('/api/admin/products/'+id,{method:'DELETE'});loadProducts();}catch(err){alert(err.message)}};
checkAdmin();

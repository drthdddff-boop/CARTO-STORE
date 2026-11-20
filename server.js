const express = require('express');
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;
let dbInitPromise;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 7000, // fail quickly if DB is unreachable
  query_timeout: 10000,        // avoid hanging requests indefinitely
  statement_timeout: 10000,
  ssl: process.env.DATABASE_URL && !process.env.DATABASE_URL.includes('localhost')
    ? { rejectUnauthorized: false } : false
});

app.use(express.json({ limit: '8mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(session({
  store: process.env.DATABASE_URL ? new PgSession({ pool, createTableIfMissing: true }) : undefined,
  secret: process.env.SESSION_SECRET || 'change-this-secret-before-launch',
  resave: false, saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 7*24*60*60*1000 }
}));
app.use(express.static(path.join(__dirname, 'public')));
app.get(['/admin', '/admin/', '/admin/login'], (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
// Export the Express app for Vercel serverless; initialize DB once per warm instance.
app.use(async (req, res, next) => {
  // Requests that require the database should fail clearly instead of hanging.
  if (!process.env.DATABASE_URL) {
    if (req.path.startsWith('/api/')) return res.status(503).json({ error: 'Database is not configured. Set DATABASE_URL in Vercel.' });
    return next();
  }
  try {
    dbInitPromise ||= initDb();
    await dbInitPromise;
    next();
  } catch (e) {
    console.error('Database initialization failed:', e.message || e);
    dbInitPromise = null; // allow a later request to retry initialization
    if (!res.headersSent) return res.status(503).json({ error: 'Database connection failed. Check DATABASE_URL and your database provider.' });
  }
});

async function initDb() {
  if (!process.env.DATABASE_URL) {
    console.warn('DATABASE_URL is missing. Configure a PostgreSQL database in Vercel environment variables.');
    return;
  }
  await pool.query(`
    CREATE TABLE IF NOT EXISTS products (
      id SERIAL PRIMARY KEY, name TEXT NOT NULL, category TEXT NOT NULL,
      price NUMERIC(10,2) NOT NULL, image TEXT, description TEXT DEFAULT '',
      sizes TEXT[] DEFAULT '{}', stock INTEGER DEFAULT 0, created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS orders (
      id BIGSERIAL PRIMARY KEY, order_code TEXT UNIQUE NOT NULL,
      customer_name TEXT NOT NULL, email TEXT NOT NULL, phone TEXT NOT NULL,
      address TEXT NOT NULL, payment_method TEXT NOT NULL DEFAULT 'COD',
      total NUMERIC(10,2) NOT NULL, status TEXT NOT NULL DEFAULT 'Order Placed',
      items JSONB NOT NULL, tracking_number TEXT DEFAULT '',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS admins (
      id SERIAL PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL
    );
  `);
  const count = await pool.query('SELECT COUNT(*)::int AS n FROM products');
  if (!count.rows[0].n) {
    const seeds = [
      ['CARTO Oversized Tee','Clothing',799,'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=900','Everyday heavyweight oversized tee.',['S','M','L','XL'],30],
      ['Essential Hoodie','Clothing',1499,'https://images.unsplash.com/photo-1556821840-3a63f95609a7?w=900','Soft fleece hoodie for daily wear.',['S','M','L','XL'],20],
      ['Classic Street Sneakers','Shoes',2499,'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=900','Street-ready sneakers with cushioned comfort.',['7','8','9','10','11'],15],
      ['Runner Pro Shoes','Shoes',3299,'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=900','Lightweight everyday running shoes.',['7','8','9','10','11'],12],
      ['Relaxed Fit Jeans','Clothing',1799,'https://images.unsplash.com/photo-1542272604-787c3835535d?w=900','Relaxed denim with a clean silhouette.',['28','30','32','34','36'],18],
      ['Everyday Polo','Clothing',999,'https://images.unsplash.com/photo-1625910513413-5fc4e4f4b6a5?w=900','Smart casual polo for any occasion.',['S','M','L','XL'],25]
    ];
    for (const p of seeds) await pool.query(
      'INSERT INTO products(name,category,price,image,description,sizes,stock) VALUES($1,$2,$3,$4,$5,$6,$7)', p);
  }
  if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
    const hash = await bcrypt.hash(process.env.ADMIN_PASSWORD, 12);
    await pool.query(`INSERT INTO admins(email,password_hash) VALUES($1,$2)
      ON CONFLICT(email) DO UPDATE SET password_hash=EXCLUDED.password_hash`,
      [process.env.ADMIN_EMAIL.toLowerCase(), hash]);
  }
}
function mailer() {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) return null;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || 'false') === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });
}
async function sendMail(to, subject, html) {
  const transport = mailer();
  if (!transport) { console.warn('Email skipped: SMTP settings are not configured.'); return; }
  await transport.sendMail({ from: process.env.MAIL_FROM || process.env.SMTP_USER, to, subject, html });
}
const adminOnly = (req,res,next) => req.session.admin ? next() : res.status(401).json({error:'Please sign in as admin.'});
const safeOrder = r => ({...r, total: Number(r.total)});
app.get('/api/products', async (req,res) => {
  try {
    if (!process.env.DATABASE_URL) return res.json([]);
    const { rows } = await pool.query('SELECT * FROM products ORDER BY created_at DESC');
    res.json(rows);
  } catch(e) { res.status(500).json({error:'Could not load products.'}); }
});
app.post('/api/orders', async (req,res) => {
  const {name,email,phone,address,paymentMethod='COD',items} = req.body || {};
  if (!name || !email || !phone || !address || !Array.isArray(items) || !items.length)
    return res.status(400).json({error:'Please complete all checkout details and add a product.'});
  if (!process.env.DATABASE_URL) return res.status(503).json({error:'Store database is not connected yet.'});
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let total = 0, verified = [];
    for (const item of items) {
      const id = Number(item.id), qty = Math.max(1, Math.min(10, Number(item.qty)||1));
      const { rows } = await client.query('SELECT * FROM products WHERE id=$1 FOR UPDATE',[id]);
      if (!rows.length || rows[0].stock < qty) throw new Error('A product is unavailable or has insufficient stock.');
      const p = rows[0]; total += Number(p.price)*qty;
      verified.push({id:p.id,name:p.name,price:Number(p.price),qty,size:String(item.size||'')});
      await client.query('UPDATE products SET stock=stock-$1 WHERE id=$2',[qty,id]);
    }
    const code = 'CARTO-' + Date.now().toString().slice(-8);
    const { rows } = await client.query(`INSERT INTO orders
      (order_code,customer_name,email,phone,address,payment_method,total,items)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [code,name,email,phone,address,paymentMethod,total,JSON.stringify(verified)]);
    await client.query('COMMIT');
    const order = safeOrder(rows[0]);
    const itemLines = verified.map(i=>`<li>${i.name} — Size ${i.size||'N/A'} × ${i.qty} — ₹${(i.price*i.qty).toFixed(2)}</li>`).join('');
    const adminHtml = `<h2>New CARTO order</h2><p><b>${code}</b></p><p>${name} · ${phone} · ${email}</p><p>${address}</p><ul>${itemLines}</ul><h3>Total: ₹${total.toFixed(2)}</h3><p>Payment: ${paymentMethod}</p><p>Review and confirm this order in your CARTO admin dashboard.</p>`;
    if (process.env.ADMIN_EMAIL) sendMail(process.env.ADMIN_EMAIL, `New CARTO order ${code}`, adminHtml).catch(console.error);
    sendMail(email, `CARTO order received — ${code}`, `<h2>Thanks for shopping with CARTO!</h2><p>Your order <b>${code}</b> has been received. Current status: Order Placed.</p><p>Total: ₹${total.toFixed(2)}</p>`).catch(console.error);
    res.status(201).json({orderCode:code,message:'Order placed successfully.'});
  } catch(e) {
    await client.query('ROLLBACK');
    res.status(400).json({error:e.message || 'Could not place order.'});
  } finally { client.release(); }
});
app.get('/api/track/:code', async (req,res) => {
  try {
    const {rows}=await pool.query('SELECT order_code,customer_name,total,status,tracking_number,created_at,items FROM orders WHERE order_code=$1',[req.params.code.toUpperCase()]);
    if(!rows.length) return res.status(404).json({error:'Order not found. Check your order ID.'});
    res.json(safeOrder(rows[0]));
  } catch(e){res.status(500).json({error:'Tracking is temporarily unavailable.'});}
});
app.post('/api/admin/login', async(req,res)=>{
  try {
    const {email,password}=req.body;
    const {rows}=await pool.query('SELECT * FROM admins WHERE email=$1',[String(email||'').toLowerCase()]);
    if(!rows.length || !await bcrypt.compare(String(password||''),rows[0].password_hash))
      return res.status(401).json({error:'Incorrect admin email or password.'});
    req.session.admin={email:rows[0].email}; res.json({ok:true,email:rows[0].email});
  } catch(e){res.status(500).json({error:'Admin login is not configured.'});}
});
app.post('/api/admin/logout',(req,res)=>req.session.destroy(()=>res.json({ok:true})));
app.get('/api/admin/me',(req,res)=>res.json({admin:req.session.admin||null}));
app.get('/api/admin/orders',adminOnly,async(req,res)=>{
  const {rows}=await pool.query('SELECT * FROM orders ORDER BY created_at DESC'); res.json(rows.map(safeOrder));
});
app.patch('/api/admin/orders/:id',adminOnly,async(req,res)=>{
  const allowed=['Order Confirmed','Processing','Packed','Shipped','Out for Delivery','Delivered','Cancelled'];
  const {status,trackingNumber=''}=req.body;
  if(!allowed.includes(status)) return res.status(400).json({error:'Invalid order status.'});
  const {rows}=await pool.query('UPDATE orders SET status=$1,tracking_number=$2 WHERE id=$3 RETURNING *',[status,trackingNumber,req.params.id]);
  if(!rows.length) return res.status(404).json({error:'Order not found.'});
  const o=safeOrder(rows[0]);
  sendMail(o.email,`CARTO order update — ${o.order_code}`,
    `<h2>Your CARTO order has been updated</h2><p>Order: <b>${o.order_code}</b></p><p>New status: <b>${status}</b></p>${trackingNumber?`<p>Tracking number: ${trackingNumber}</p>`:''}<p>Thank you for shopping with CARTO.</p>`).catch(console.error);
  res.json(o);
});
app.post('/api/admin/products',adminOnly,async(req,res)=>{
  const {name,category,price,image,description,sizes,stock}=req.body || {};
  if(!name || !category || !Number(price)) return res.status(400).json({error:'Name, category and price are required.'});
  try {
    const {rows}=await pool.query(`INSERT INTO products(name,category,price,image,description,sizes,stock)
      VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [name,category,price,image||'',description||'',Array.isArray(sizes)?sizes:[],Number(stock)||0]);
    return res.status(201).json({ok:true,product:rows[0],message:'Product saved successfully.'});
  } catch (e) {
    console.error('Product save failed:', e.message || e);
    return res.status(503).json({error:'Could not save product. Database connection failed or timed out.'});
  }
});
app.delete('/api/admin/products/:id',adminOnly,async(req,res)=>{
  await pool.query('DELETE FROM products WHERE id=$1',[req.params.id]); res.json({ok:true});
});
app.get('*',(req,res)=>res.sendFile(path.join(__dirname,'public','index.html')));
if (require.main === module) {
  initDb().then(()=>app.listen(port,()=>console.log(`CARTO running on ${port}`)))
    .catch(e=>{console.error('Startup error:',e);process.exit(1);});
}
module.exports = app;

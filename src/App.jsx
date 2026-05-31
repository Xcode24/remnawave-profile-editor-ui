import { useState, useRef, useEffect } from "react";

const DEFAULT_CONFIG = {
  log: { loglevel: "warning" },
  dns: {
    hosts: { "dns.google": "8.8.8.8", "cloudflare-dns.com": "1.1.1.1" },
    servers: ["https://cloudflare-dns.com/dns-query", { address: "https://dns.google/dns-query", domains: [] }],
    queryStrategy: "UseIPv4"
  },
  inbounds: [],
  outbounds: [{ tag: "DIRECT", protocol: "freedom" }, { tag: "BLOCK", protocol: "blackhole" }],
  routing: { rules: [], domainStrategy: "IPIfNonMatch" }
};

const uid = () => Math.random().toString(36).slice(2, 8).toUpperCase();
const clone = (x) => JSON.parse(JSON.stringify(x));
const genUUID = () => "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === "x" ? r : (r & 0x3 | 0x8)).toString(16); });

const PROTOCOLS_IN = ["vless", "vmess", "trojan", "mixed", "http", "https"];
const PROTOCOLS_OUT = ["vless", "vmess", "trojan", "socks", "http", "https", "freedom", "blackhole"];
const SECURITY = ["none", "tls", "reality", "xtls"];
const NETWORK = ["raw", "tcp", "ws", "xhttp", "grpc", "h2", "quic"];
const FLOW = ["", "xtls-rprx-vision", "xtls-rprx-vision-udp443"];
const LOG_LEVELS = ["debug", "info", "warning", "error", "none"];
const DOMAIN_STRATEGY = ["AsIs", "UseIP", "UseIPv4", "UseIPv6", "IPIfNonMatch", "IPOnDemand"];
const QUERY_STRATEGY = ["UseIP", "UseIPv4", "UseIPv6"];
const FINGERPRINTS = ["chrome", "firefox", "safari", "ios", "android", "edge", "360", "qq", "random", "randomized"];

const PROTO_COLOR = {
  vless: "#6366f1", vmess: "#8b5cf6", trojan: "#ec4899",
  socks: "#14b8a6", mixed: "#14b8a6", http: "#f59e0b", https: "#10b981",
  freedom: "#22c55e", blackhole: "#ef4444", hysteria2: "#f97316", xhttp: "#06b6d4"
};
const protoColor = (p) => PROTO_COLOR[p] || "#64748b";

// ── atoms ──────────────────────────────────────────────────────────────────────
function Chip({ children, color = "#6366f1" }) {
  return <span style={{ background: color + "22", color, border: `1px solid ${color}55`, borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 600, fontFamily: "monospace" }}>{children}</span>;
}

function Btn({ children, onClick, variant = "ghost", danger, disabled, style }) {
  const base = { border: "1px solid", borderRadius: 8, padding: "6px 14px", fontSize: 13, cursor: disabled ? "not-allowed" : "pointer", fontWeight: 500, transition: "all .15s", display: "inline-flex", alignItems: "center", gap: 6, opacity: disabled ? 0.5 : 1, background: "transparent", ...style };
  const v = danger ? { borderColor: "#ef444455", color: "#ef4444", background: "#ef444412" } : variant === "primary" ? { borderColor: "#6366f1", color: "#fff", background: "#6366f1" } : { borderColor: "var(--color-border-secondary)", color: "var(--color-text-secondary)" };
  return <button onClick={disabled ? undefined : onClick} style={{ ...base, ...v }}>{children}</button>;
}

function Input({ label, value, onChange, type = "text", placeholder, mono, small, fullWidth, options }) {
  const s = { background: "var(--color-background-secondary)", border: "1px solid var(--color-border-tertiary)", borderRadius: 6, padding: small ? "4px 8px" : "6px 10px", color: "var(--color-text-primary)", fontSize: small ? 12 : 13, fontFamily: mono ? "monospace" : "inherit", width: fullWidth ? "100%" : undefined, boxSizing: "border-box", height: small ? 28 : 34 };
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      {label && <span style={{ fontSize: 11, color: "var(--color-text-secondary)", fontWeight: 500 }}>{label}</span>}
      {options
        ? <select value={value} onChange={e => onChange(e.target.value)} style={s}>{options.map(o => <option key={o.value ?? o} value={o.value ?? o}>{o.label ?? o}</option>)}</select>
        : <input type={type} value={value ?? ""} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={s} />}
    </label>
  );
}

function Toggle({ label, value, onChange }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", userSelect: "none" }}>
      <div onClick={() => onChange(!value)} style={{ width: 36, height: 20, borderRadius: 10, background: value ? "#6366f1" : "var(--color-border-secondary)", position: "relative", transition: "background .2s", flexShrink: 0 }}>
        <div style={{ position: "absolute", top: 2, left: value ? 18 : 2, width: 16, height: 16, borderRadius: 8, background: "#fff", transition: "left .2s" }} />
      </div>
      <span style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>{label}</span>
    </label>
  );
}

function Card({ children, title, style, actions }) {
  return (
    <div style={{ background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: 12, padding: "14px 16px", ...style }}>
      {(title || actions) && <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>{title && <span style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-secondary)" }}>{title}</span>}{actions}</div>}
      {children}
    </div>
  );
}

const Row = ({ children, gap = 10 }) => <div style={{ display: "flex", gap, alignItems: "flex-end", flexWrap: "wrap" }}>{children}</div>;
const Sec = ({ children }) => <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{children}</div>;

// ── deep set helper ────────────────────────────────────────────────────────────
function deepSet(obj, path, val) {
  const c = clone(obj);
  const keys = path.split(".");
  let cur = c;
  for (let i = 0; i < keys.length - 1; i++) {
    if (cur[keys[i]] === undefined || cur[keys[i]] === null || typeof cur[keys[i]] !== "object") cur[keys[i]] = {};
    cur = cur[keys[i]];
  }
  cur[keys[keys.length - 1]] = val;
  return c;
}

// ── default builders ───────────────────────────────────────────────────────────
function buildDefaultInbound(proto) {
  const base = { tag: "IN_" + uid(), port: 7443, listen: "0.0.0.0", protocol: proto };
  if (proto === "vless") return { ...base, settings: { clients: [], decryption: "none" }, sniffing: { enabled: true, destOverride: ["http", "tls", "quic"] }, streamSettings: { network: "raw", security: "reality", realitySettings: { dest: "x5.ru:443", shortIds: [""], privateKey: "", serverNames: ["x5.ru"] } } };
  if (proto === "socks" || proto === "mixed") return { ...base, port: 1080, protocol: proto, settings: { auth: "noauth", accounts: [], udp: true }, sniffing: { enabled: false } };
  if (proto === "http" || proto === "https") return { ...base, port: 3128, settings: { accounts: [{ user: "user", pass: "pass" }], allowTransparent: false }, sniffing: { enabled: false } };
  return { ...base, settings: {}, sniffing: { enabled: false } };
}

function buildDefaultOutbound(proto) {
  const base = { tag: "OUT_" + uid(), protocol: proto };
  if (proto === "freedom") return { ...base, protocol: "freedom" };
  if (proto === "blackhole") return { ...base, protocol: "blackhole" };
  if (proto === "vless") return { ...base, settings: { vnext: [{ address: "example.com", port: 443, users: [{ id: genUUID(), flow: "xtls-rprx-vision", level: 0, encryption: "none" }] }] }, streamSettings: { network: "raw", security: "reality", realitySettings: { show: false, shortId: "", publicKey: "", serverName: "tradingview.com", fingerprint: "chrome" } }, mux: { enabled: false } };
  if (proto === "socks") return { ...base, settings: { servers: [{ address: "127.0.0.1", port: 1080, users: [] }] } };
  if (proto === "http" || proto === "https") return { ...base, settings: { servers: [{ address: "127.0.0.1", port: 3128, users: [] }] } };
  return { ...base, settings: {} };
}

// ── AccountsSection ────────────────────────────────────────────────────────────
function AccountsSection({ accounts, onChange, otherInbounds = [] }) {
  const [showPopup, setShowPopup] = useState(false);
  const popupRef = useRef(null);

  // collect accounts from other inbounds that have auth accounts
  const borrowed = [];
  otherInbounds.forEach(inb => {
    const accs = inb.settings?.accounts || [];
    accs.forEach(a => {
      if (a.user && !borrowed.find(x => x.user === a.user))
        borrowed.push({ ...a, _from: inb.tag });
    });
  });

  // close popup on outside click
  useEffect(() => {
    if (!showPopup) return;
    const handler = (e) => { if (popupRef.current && !popupRef.current.contains(e.target)) setShowPopup(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showPopup]);

  const addNew = () => {
    onChange([...accounts, { user: "user_" + uid().toLowerCase(), pass: uid().toLowerCase() }]);
    setShowPopup(false);
  };

  const borrow = (acc) => {
    if (!accounts.find(a => a.user === acc.user))
      onChange([...accounts, { user: acc.user, pass: acc.pass }]);
    setShowPopup(false);
  };

  const update = (i, field, val) => onChange(accounts.map((a, idx) => idx === i ? { ...a, [field]: val } : a));
  const remove = (i) => onChange(accounts.filter((_, idx) => idx !== i));
  const copyToClipboard = (i) => navigator.clipboard.writeText(`${accounts[i].user}:${accounts[i].pass}`);

  return (
    <div style={{ background: "var(--color-background-secondary)", borderRadius: 8, padding: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: accounts.length > 0 ? 10 : 6 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: "var(--color-text-secondary)" }}>
          Accounts {accounts.length > 0 && <span style={{ color: "#6366f1" }}>({accounts.length})</span>}
        </span>

        {/* + Add button with popup */}
        <div style={{ position: "relative" }} ref={popupRef}>
          <Btn onClick={() => setShowPopup(v => !v)}>+ Add</Btn>
          {showPopup && (
            <div style={{
              position: "absolute", right: 0, top: "calc(100% + 6px)", zIndex: 100,
              background: "var(--color-background-primary)",
              border: "1px solid var(--color-border-secondary)",
              borderRadius: 10, padding: 8, minWidth: 220,
              boxShadow: "0 8px 24px #0005"
            }}>
              {/* New account */}
              <button onClick={addNew} style={{ width: "100%", textAlign: "left", background: "transparent", border: "none", borderRadius: 7, padding: "8px 10px", cursor: "pointer", fontSize: 13, color: "var(--color-text-primary)", display: "flex", alignItems: "center", gap: 8 }}
                onMouseEnter={e => e.currentTarget.style.background = "#6366f111"}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                <span style={{ fontSize: 16, color: "#6366f1" }}>+</span>
                <span>Новый аккаунт</span>
              </button>

              {/* Divider + borrowed */}
              {borrowed.length > 0 && (
                <>
                  <div style={{ height: 1, background: "var(--color-border-tertiary)", margin: "6px 0" }} />
                  <div style={{ fontSize: 10, color: "var(--color-text-secondary)", padding: "2px 10px 6px", textTransform: "uppercase", letterSpacing: "0.06em" }}>Заимствовать из</div>
                  {borrowed.map((acc, i) => {
                    const alreadyAdded = !!accounts.find(a => a.user === acc.user);
                    return (
                      <button key={i} onClick={() => !alreadyAdded && borrow(acc)} disabled={alreadyAdded}
                        style={{ width: "100%", textAlign: "left", background: "transparent", border: "none", borderRadius: 7, padding: "7px 10px", cursor: alreadyAdded ? "default" : "pointer", fontSize: 12, color: alreadyAdded ? "var(--color-text-secondary)" : "var(--color-text-primary)", display: "flex", alignItems: "center", gap: 8, opacity: alreadyAdded ? 0.5 : 1 }}
                        onMouseEnter={e => { if (!alreadyAdded) e.currentTarget.style.background = "#6366f111"; }}
                        onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                        <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
                          <span style={{ fontFamily: "monospace", fontSize: 12, fontWeight: 600 }}>{acc.user}</span>
                          <span style={{ fontSize: 10, color: "var(--color-text-secondary)" }}>{acc._from}</span>
                        </div>
                        {alreadyAdded && <span style={{ fontSize: 10, color: "#22c55e" }}>✓</span>}
                      </button>
                    );
                  })}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {accounts.length === 0 && (
        <div style={{ fontSize: 12, color: "#f59e0b" }}>⚠ Нет аккаунтов — добавьте хотя бы один</div>
      )}

      {accounts.map((acc, i) => (
        <div key={i} style={{ background: "var(--color-background-primary)", borderRadius: 8, border: "0.5px solid var(--color-border-tertiary)", padding: "8px 10px", marginBottom: 6 }}>
          <Row>
            <div style={{ flex: 1 }}><Input label="User" value={acc.user} onChange={v => update(i, "user", v)} fullWidth /></div>
            <div style={{ flex: 1 }}><Input label="Pass" value={acc.pass} onChange={v => update(i, "pass", v)} fullWidth /></div>
          </Row>
          <div style={{ display: "flex", gap: 6, marginTop: 7 }}>
            <button onClick={() => copyToClipboard(i)}
              style={{ background: "transparent", border: "1px solid var(--color-border-tertiary)", borderRadius: 6, padding: "3px 10px", cursor: "pointer", fontSize: 11, color: "var(--color-text-secondary)" }}>
              ⎘ Копировать
            </button>
            <div style={{ flex: 1 }} />
            <button onClick={() => remove(i)}
              style={{ background: "transparent", border: "1px solid #ef444433", borderRadius: 6, padding: "3px 10px", cursor: "pointer", fontSize: 11, color: "#ef4444" }}>
              ✕
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── InboundCard ────────────────────────────────────────────────────────────────
function InboundCard({ inb, onChange, onDelete, allInbounds = [] }) {
  const proto = inb.protocol;
  const ss = inb.streamSettings || {};
  const rs = ss.realitySettings || {};
  const sniff = inb.sniffing || { enabled: false };
  const set = (path, val) => onChange(deepSet(inb, path, val));

  return (
    <Card style={{ borderLeft: `3px solid ${protoColor(proto)}` }}
      title={<span style={{ display: "flex", alignItems: "center", gap: 8, paddingLeft: 24 }}><Chip color={protoColor(proto)}>{proto}</Chip><span style={{ fontFamily: "monospace", fontSize: 12 }}>{inb.tag}</span></span>}
      actions={<Btn danger onClick={onDelete}>✕</Btn>}>
      <Sec>
        <Row>
          <div style={{ flex: 2 }}><Input label="Tag" value={inb.tag} onChange={v => set("tag", v)} fullWidth /></div>
          <div style={{ flex: 1 }}><Input label="Port" value={inb.port} type="number" onChange={v => set("port", +v)} fullWidth /></div>
          <div style={{ flex: 1.5 }}><Input label="Listen" value={inb.listen} onChange={v => set("listen", v)} fullWidth /></div>
          <div style={{ flex: 1.5 }}><Input label="Protocol" value={proto} options={PROTOCOLS_IN.map(p => ({ value: p, label: p }))} onChange={v => { const c = buildDefaultInbound(v); c.tag = inb.tag; c.port = inb.port; onChange(c); }} fullWidth /></div>
        </Row>
        <Row><Toggle label="Sniffing" value={sniff.enabled} onChange={v => set("sniffing.enabled", v)} /></Row>

        {(proto === "vless" || proto === "vmess" || proto === "trojan") && (
          <>
            <Row>
              <div style={{ flex: 1 }}><Input label="Network" value={ss.network || "raw"} options={NETWORK} onChange={v => set("streamSettings.network", v)} fullWidth /></div>
              <div style={{ flex: 1 }}><Input label="Security" value={ss.security || "none"} options={SECURITY} onChange={v => set("streamSettings.security", v)} fullWidth /></div>
            </Row>
            {ss.security === "reality" && (
              <div style={{ background: "var(--color-background-secondary)", borderRadius: 8, padding: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "var(--color-text-secondary)", marginBottom: 8 }}>REALITY Settings</div>
                <Row>
                  <div style={{ flex: 2 }}><Input label="Dest" value={rs.dest || ""} onChange={v => set("streamSettings.realitySettings.dest", v)} fullWidth mono /></div>
                  <div style={{ flex: 3 }}><Input label="Private Key" value={rs.privateKey || ""} onChange={v => set("streamSettings.realitySettings.privateKey", v)} fullWidth mono /></div>
                </Row>
                <Row>
                  <div style={{ flex: 2 }}><Input label="Server Names (через запятую)" value={(rs.serverNames || []).join(",")} onChange={v => set("streamSettings.realitySettings.serverNames", v.split(",").map(s => s.trim()))} fullWidth /></div>
                  <div style={{ flex: 2 }}><Input label="Short IDs (через запятую)" value={(rs.shortIds || []).join(",")} onChange={v => set("streamSettings.realitySettings.shortIds", v.split(",").map(s => s.trim()))} fullWidth /></div>
                </Row>
              </div>
            )}
            {ss.security === "tls" && (
              <div style={{ background: "var(--color-background-secondary)", borderRadius: 8, padding: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "var(--color-text-secondary)", marginBottom: 8 }}>TLS Settings</div>
                <Row>
                  <div style={{ flex: 2 }}><Input label="SNI" value={ss.tlsSettings?.serverName || ""} onChange={v => set("streamSettings.tlsSettings.serverName", v)} fullWidth /></div>
                  <div style={{ flex: 2 }}><Input label="Alpn (через запятую)" value={(ss.tlsSettings?.alpn || []).join(",")} onChange={v => set("streamSettings.tlsSettings.alpn", v.split(",").map(s => s.trim()))} fullWidth /></div>
                </Row>
              </div>
            )}
            {ss.network === "ws" && (
              <div style={{ background: "var(--color-background-secondary)", borderRadius: 8, padding: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "var(--color-text-secondary)", marginBottom: 8 }}>WebSocket</div>
                <Row>
                  <div style={{ flex: 2 }}><Input label="Path" value={ss.wsSettings?.path || "/"} onChange={v => set("streamSettings.wsSettings.path", v)} fullWidth mono /></div>
                  <div style={{ flex: 2 }}><Input label="Host" value={ss.wsSettings?.headers?.Host || ""} onChange={v => set("streamSettings.wsSettings.headers.Host", v)} fullWidth /></div>
                </Row>
              </div>
            )}
            {ss.network === "xhttp" && (
              <div style={{ background: "var(--color-background-secondary)", borderRadius: 8, padding: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "var(--color-text-secondary)", marginBottom: 8 }}>XHTTP</div>
                <Row>
                  <div style={{ flex: 2 }}><Input label="Path" value={ss.xhttpSettings?.path || "/"} onChange={v => set("streamSettings.xhttpSettings.path", v)} fullWidth mono /></div>
                  <div style={{ flex: 1 }}><Input label="Mode" value={ss.xhttpSettings?.mode || "auto"} options={["auto","stream-one","stream-up","packet-up"]} onChange={v => set("streamSettings.xhttpSettings.mode", v)} fullWidth /></div>
                </Row>
              </div>
            )}
          </>
        )}

        {(proto === "http" || proto === "https") && (
          <AccountsSection
            accounts={inb.settings?.accounts || []}
            onChange={accounts => { const c = clone(inb); c.settings.accounts = accounts; onChange(c); }}
            otherInbounds={allInbounds.filter(b => b.tag !== inb.tag && (b.settings?.accounts || []).length > 0)}
          />
        )}

        {(proto === "socks" || proto === "mixed") && (
          <div style={{ background: "var(--color-background-secondary)", borderRadius: 8, padding: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--color-text-secondary)", marginBottom: 8 }}>
              {proto === "mixed" ? "Mixed (SOCKS5 + HTTP)" : "Socks"}
              {proto === "mixed" && <span style={{ marginLeft: 8, fontSize: 10, color: "#6366f1", fontWeight: 400 }}>принимает SOCKS5 и HTTP одновременно</span>}
            </div>
            <Row>
              <div style={{ flex: 1 }}><Input label="Auth" value={inb.settings?.auth || "noauth"} options={["noauth", "password"]} onChange={v => set("settings.auth", v)} fullWidth /></div>
              <Toggle label="UDP" value={inb.settings?.udp !== false} onChange={v => set("settings.udp", v)} />
            </Row>
            {inb.settings?.auth === "password" && (
              <div style={{ marginTop: 10 }}>
                <AccountsSection
                  accounts={inb.settings?.accounts || []}
                  onChange={accounts => { const c = clone(inb); c.settings.accounts = accounts; onChange(c); }}
                  otherInbounds={allInbounds.filter(b => b.tag !== inb.tag && (b.settings?.accounts || []).length > 0)}
                />
              </div>
            )}
          </div>
        )}

        {proto === "vless" && (
          <div style={{ background: "var(--color-background-secondary)", borderRadius: 8, padding: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: "var(--color-text-secondary)" }}>Clients ({(inb.settings?.clients || []).length})</span>
              <Btn onClick={() => { const c = clone(inb); if (!c.settings.clients) c.settings.clients = []; c.settings.clients.push({ id: genUUID(), flow: (ss.security === "reality" || ss.security === "tls") ? "xtls-rprx-vision" : "", level: 0, email: "" }); onChange(c); }}>+ Client</Btn>
            </div>
            {(inb.settings?.clients || []).map((cl, i) => (
              <div key={i} style={{ background: "var(--color-background-primary)", borderRadius: 8, border: "0.5px solid var(--color-border-tertiary)", padding: "10px 12px", marginBottom: 8 }}>
                <Row>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <label style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                      <span style={{ fontSize: 11, color: "var(--color-text-secondary)", fontWeight: 500 }}>UUID</span>
                      <div style={{ display: "flex", gap: 6 }}>
                        <input value={cl.id} onChange={e => { const c = clone(inb); c.settings.clients[i].id = e.target.value; onChange(c); }} style={{ flex: 1, background: "var(--color-background-secondary)", border: "1px solid var(--color-border-tertiary)", borderRadius: 6, padding: "6px 10px", color: "var(--color-text-primary)", fontSize: 12, fontFamily: "monospace", minWidth: 0, height: 34, boxSizing: "border-box" }} />
                        <button title="Generate UUID" onClick={() => { const c = clone(inb); c.settings.clients[i].id = genUUID(); onChange(c); }} style={{ background: "var(--color-background-secondary)", border: "1px solid var(--color-border-tertiary)", borderRadius: 6, padding: "0 10px", cursor: "pointer", fontSize: 16, color: "var(--color-text-secondary)", flexShrink: 0, height: 34 }}>⟳</button>
                      </div>
                    </label>
                  </div>
                </Row>
                <Row style={{ marginTop: 8 }}>
                  <div style={{ flex: 1 }}>
                    <Input label="Flow" value={cl.flow || ""} options={FLOW.map(f => ({ value: f, label: f || "(none)" }))} onChange={v => { const c = clone(inb); c.settings.clients[i].flow = v; onChange(c); }} fullWidth />
                    {(ss.security === "reality" || ss.security === "tls") && !cl.flow && <div style={{ fontSize: 11, color: "#f59e0b", marginTop: 3 }}>⚠ Рекомендуется xtls-rprx-vision</div>}
                  </div>
                  <div style={{ flex: 1 }}><Input label="Email / Remark" value={cl.email || ""} onChange={v => { const c = clone(inb); c.settings.clients[i].email = v; onChange(c); }} fullWidth /></div>
                  <div style={{ flex: 0.4 }}><Input label="Level" value={cl.level ?? 0} type="number" onChange={v => { const c = clone(inb); c.settings.clients[i].level = +v; onChange(c); }} fullWidth /></div>
                  <div style={{ paddingTop: 20 }}><Btn danger onClick={() => { const c = clone(inb); c.settings.clients.splice(i, 1); onChange(c); }}>✕</Btn></div>
                </Row>
              </div>
            ))}
          </div>
        )}
      </Sec>
    </Card>
  );
}

// ── Link parsers ───────────────────────────────────────────────────────────────
function parseVlessLink(url) {
  try {
    const u = new URL(url);
    if (u.protocol !== "vless:") return null;
    const params = Object.fromEntries(u.searchParams);
    const security = params.security || "none";
    const network = params.type || "tcp";
    const out = {
      tag: decodeURIComponent(u.hash.slice(1)) || "VLESS_" + uid(),
      protocol: "vless",
      settings: { vnext: [{ address: u.hostname, port: parseInt(u.port) || 443, users: [{ id: u.username, flow: params.flow || "", level: 0, encryption: "none" }] }] },
      streamSettings: { network: network === "tcp" ? "raw" : network, security },
      mux: { enabled: false }
    };
    if (security === "reality") out.streamSettings.realitySettings = { show: false, serverName: params.sni || u.hostname, fingerprint: params.fp || "chrome", publicKey: params.pbk || "", shortId: params.sid || "" };
    if (security === "tls") out.streamSettings.tlsSettings = { serverName: params.sni || u.hostname, fingerprint: params.fp || "chrome", allowInsecure: params.allowInsecure === "1" };
    if (network === "ws") out.streamSettings.wsSettings = { path: params.path || "/", headers: { Host: params.host || u.hostname } };
    if (network === "xhttp" || network === "splithttp") out.streamSettings.xhttpSettings = { path: params.path || "/", host: params.host || u.hostname, mode: params.mode || "auto" };
    return out;
  } catch { return null; }
}

function parseVmessLink(url) {
  try {
    if (!url.startsWith("vmess://")) return null;
    const json = JSON.parse(atob(url.slice(8)));
    const network = json.net || "tcp";
    const security = json.tls === "tls" ? "tls" : "none";
    const out = {
      tag: json.ps || "VMESS_" + uid(), protocol: "vmess",
      settings: { vnext: [{ address: json.add, port: parseInt(json.port) || 443, users: [{ id: json.id, alterId: parseInt(json.aid) || 0, security: json.scy || "auto", level: 0 }] }] },
      streamSettings: { network: network === "tcp" ? "raw" : network, security }, mux: { enabled: false }
    };
    if (security === "tls") out.streamSettings.tlsSettings = { serverName: json.sni || json.host || json.add };
    if (network === "ws") out.streamSettings.wsSettings = { path: json.path || "/", headers: { Host: json.host || json.add } };
    return out;
  } catch { return null; }
}

function parseTrojanLink(url) {
  try {
    const u = new URL(url);
    if (u.protocol !== "trojan:") return null;
    const params = Object.fromEntries(u.searchParams);
    const security = params.security || "tls";
    const out = {
      tag: decodeURIComponent(u.hash.slice(1)) || "TROJAN_" + uid(), protocol: "trojan",
      settings: { servers: [{ address: u.hostname, port: parseInt(u.port) || 443, password: u.username, level: 0 }] },
      streamSettings: { network: "raw", security }, mux: { enabled: false }
    };
    if (security === "tls") out.streamSettings.tlsSettings = { serverName: params.sni || u.hostname, fingerprint: params.fp || "chrome" };
    if (security === "reality") out.streamSettings.realitySettings = { serverName: params.sni || u.hostname, fingerprint: params.fp || "chrome", publicKey: params.pbk || "", shortId: params.sid || "" };
    return out;
  } catch { return null; }
}

function parseLink(raw) {
  const s = raw.trim();
  if (s.startsWith("vless://")) return parseVlessLink(s);
  if (s.startsWith("vmess://")) return parseVmessLink(s);
  if (s.startsWith("trojan://")) return parseTrojanLink(s);
  if (s.startsWith("socks://") || s.startsWith("socks5://")) {
    try {
      const u = new URL(s.replace(/^socks5?:\/\//, "http://"));
      return { tag: "SOCKS_" + uid(), protocol: "socks", settings: { servers: [{ address: u.hostname, port: parseInt(u.port) || 1080, users: u.username ? [{ user: u.username, pass: u.password }] : [] }] } };
    } catch { return null; }
  }
  try {
    const j = JSON.parse(s);
    if (j && j.protocol) return j;
    if (j && Array.isArray(j.outbounds)) return j.outbounds.find(o => o.protocol !== "freedom" && o.protocol !== "blackhole") || null;
  } catch {}
  return null;
}

// ── AddOutboundPanel ───────────────────────────────────────────────────────────
function AddOutboundPanel({ onAdd }) {
  const [mode, setMode] = useState("quick");
  const [proto, setProto] = useState("vless");
  const [text, setText] = useState("");
  const [err, setErr] = useState(null);
  const [ok, setOk] = useState(false);

  const handleImport = () => {
    setErr(null);
    const result = parseLink(text);
    if (!result) { setErr("Не удалось распознать. Поддерживаются: vless://, vmess://, trojan://, socks5://, или JSON."); return; }
    if (!result.tag) result.tag = (result.protocol || "OUT").toUpperCase() + "_" + uid();
    onAdd(result);
    setText(""); setOk(true); setTimeout(() => setOk(false), 2000);
  };

  return (
    <Card style={{ border: "1px solid #6366f133" }}>
      <div style={{ display: "flex", gap: 0, marginBottom: 12, background: "var(--color-background-secondary)", borderRadius: 8, padding: 3, width: "fit-content", border: "0.5px solid var(--color-border-tertiary)" }}>
        {[["quick", "Быстрое создание"], ["import", "Из ссылки / JSON"]].map(([id, label]) => (
          <button key={id} onClick={() => { setMode(id); setErr(null); }}
            style={{ border: "none", borderRadius: 6, padding: "5px 14px", cursor: "pointer", fontSize: 12, fontWeight: 500, background: mode === id ? "#6366f1" : "transparent", color: mode === id ? "#fff" : "var(--color-text-secondary)", transition: "all .15s" }}>{label}</button>
        ))}
      </div>

      {mode === "quick" && (
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {PROTOCOLS_OUT.map(p => (
              <button key={p} onClick={() => setProto(p)}
                style={{ border: `1px solid ${proto === p ? protoColor(p) : "var(--color-border-tertiary)"}`, borderRadius: 7, padding: "5px 12px", cursor: "pointer", fontSize: 12, fontWeight: 500, background: proto === p ? protoColor(p) + "22" : "transparent", color: proto === p ? protoColor(p) : "var(--color-text-secondary)", transition: "all .15s", display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{ width: 7, height: 7, borderRadius: 4, background: protoColor(p), display: "inline-block" }} />{p}
              </button>
            ))}
          </div>
          <Btn variant="primary" onClick={() => onAdd(buildDefaultOutbound(proto))}>+ Добавить {proto}</Btn>
        </div>
      )}

      {mode === "import" && (
        <Sec>
          <div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>Вставьте ссылку (vless://, vmess://, trojan://, socks5://) или JSON аутбаунда:</div>
          <textarea value={text} onChange={e => { setText(e.target.value); setErr(null); }} placeholder={"vless://uuid@host:443?security=reality&pbk=...&fp=chrome&sni=example.com&sid=...&flow=xtls-rprx-vision#MyServer"} style={{ width: "100%", height: 80, fontFamily: "monospace", fontSize: 12, background: "var(--color-background-secondary)", border: err ? "1px solid #ef4444" : "1px solid var(--color-border-tertiary)", borderRadius: 8, padding: 10, color: "var(--color-text-primary)", resize: "vertical", boxSizing: "border-box" }} />
          {err && <div style={{ color: "#ef4444", fontSize: 12 }}>⚠ {err}</div>}
          {ok && <div style={{ color: "#22c55e", fontSize: 12 }}>✓ Аутбаунд добавлен!</div>}
          <Row>
            <Btn variant="primary" onClick={handleImport} disabled={!text.trim()}>Разобрать и добавить</Btn>
            <Btn onClick={() => { setText(""); setErr(null); }}>Очистить</Btn>
          </Row>
        </Sec>
      )}
    </Card>
  );
}

// ── OutboundCard ───────────────────────────────────────────────────────────────
function OutboundCard({ out, onChange, onDelete }) {
  const proto = out.protocol;
  const ss = out.streamSettings || {};
  const rs = ss.realitySettings || {};
  const set = (path, val) => onChange(deepSet(out, path, val));
  const isSimple = proto === "freedom" || proto === "blackhole";

  return (
    <Card style={{ borderLeft: `3px solid ${protoColor(proto)}` }}
      title={<span style={{ display: "flex", alignItems: "center", gap: 8, paddingLeft: 24 }}><Chip color={protoColor(proto)}>{proto}</Chip><span style={{ fontFamily: "monospace", fontSize: 12 }}>{out.tag}</span></span>}
      actions={<Btn danger onClick={onDelete}>✕</Btn>}>
      <Sec>
        <Row>
          <div style={{ flex: 2 }}><Input label="Tag" value={out.tag} onChange={v => set("tag", v)} fullWidth /></div>
          <div style={{ flex: 1.5 }}><Input label="Protocol" value={proto} options={PROTOCOLS_OUT.map(p => ({ value: p, label: p }))} onChange={v => onChange({ ...buildDefaultOutbound(v), tag: out.tag })} fullWidth /></div>
        </Row>

        {!isSimple && (proto === "vless" || proto === "vmess") && (() => {
          const vnext = out.settings?.vnext?.[0] || {};
          const user = vnext.users?.[0] || {};
          return (
            <>
              <Row>
                <div style={{ flex: 3 }}><Input label="Server" value={vnext.address || ""} onChange={v => { const c = clone(out); if (!c.settings.vnext) c.settings.vnext = [{}]; if (!c.settings.vnext[0].users) c.settings.vnext[0].users = [{}]; c.settings.vnext[0].address = v; onChange(c); }} fullWidth /></div>
                <div style={{ flex: 1 }}><Input label="Port" value={vnext.port || 443} type="number" onChange={v => { const c = clone(out); c.settings.vnext[0].port = +v; onChange(c); }} fullWidth /></div>
              </Row>
              <Row>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <label style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                    <span style={{ fontSize: 11, color: "var(--color-text-secondary)", fontWeight: 500 }}>UUID</span>
                    <div style={{ display: "flex", gap: 6 }}>
                      <input value={user.id || ""} onChange={e => { const c = clone(out); c.settings.vnext[0].users[0].id = e.target.value; onChange(c); }} style={{ flex: 1, background: "var(--color-background-secondary)", border: "1px solid var(--color-border-tertiary)", borderRadius: 6, padding: "6px 10px", color: "var(--color-text-primary)", fontSize: 12, fontFamily: "monospace", minWidth: 0, height: 34, boxSizing: "border-box" }} />
                      <button onClick={() => { const c = clone(out); c.settings.vnext[0].users[0].id = genUUID(); onChange(c); }} style={{ background: "var(--color-background-secondary)", border: "1px solid var(--color-border-tertiary)", borderRadius: 6, padding: "0 10px", cursor: "pointer", fontSize: 16, color: "var(--color-text-secondary)", height: 34 }}>⟳</button>
                    </div>
                  </label>
                </div>
                <div style={{ flex: 1 }}><Input label="Flow" value={user.flow || ""} options={FLOW.map(f => ({ value: f, label: f || "(none)" }))} onChange={v => { const c = clone(out); c.settings.vnext[0].users[0].flow = v; onChange(c); }} fullWidth /></div>
              </Row>
              <Row>
                <div style={{ flex: 1 }}><Input label="Network" value={ss.network || "raw"} options={NETWORK} onChange={v => set("streamSettings.network", v)} fullWidth /></div>
                <div style={{ flex: 1 }}><Input label="Security" value={ss.security || "none"} options={SECURITY} onChange={v => set("streamSettings.security", v)} fullWidth /></div>
              </Row>
              {ss.security === "reality" && (
                <div style={{ background: "var(--color-background-secondary)", borderRadius: 8, padding: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "var(--color-text-secondary)", marginBottom: 8 }}>REALITY (client)</div>
                  <Row>
                    <div style={{ flex: 2 }}><Input label="SNI" value={rs.serverName || ""} onChange={v => set("streamSettings.realitySettings.serverName", v)} fullWidth /></div>
                    <div style={{ flex: 1.5 }}><Input label="Fingerprint" value={rs.fingerprint || "chrome"} options={FINGERPRINTS} onChange={v => set("streamSettings.realitySettings.fingerprint", v)} fullWidth /></div>
                  </Row>
                  <Row>
                    <div style={{ flex: 3 }}><Input label="Public Key" value={rs.publicKey || ""} onChange={v => set("streamSettings.realitySettings.publicKey", v)} fullWidth mono /></div>
                    <div style={{ flex: 2 }}><Input label="Short ID" value={rs.shortId || ""} onChange={v => set("streamSettings.realitySettings.shortId", v)} fullWidth mono /></div>
                  </Row>
                </div>
              )}
              {ss.security === "tls" && (
                <div style={{ background: "var(--color-background-secondary)", borderRadius: 8, padding: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "var(--color-text-secondary)", marginBottom: 8 }}>TLS</div>
                  <Row>
                    <div style={{ flex: 2 }}><Input label="SNI" value={ss.tlsSettings?.serverName || ""} onChange={v => set("streamSettings.tlsSettings.serverName", v)} fullWidth /></div>
                    <div style={{ flex: 1.5 }}><Input label="Fingerprint" value={ss.tlsSettings?.fingerprint || "chrome"} options={FINGERPRINTS} onChange={v => set("streamSettings.tlsSettings.fingerprint", v)} fullWidth /></div>
                  </Row>
                </div>
              )}
              {ss.network === "ws" && (
                <div style={{ background: "var(--color-background-secondary)", borderRadius: 8, padding: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "var(--color-text-secondary)", marginBottom: 8 }}>WebSocket</div>
                  <Row>
                    <div style={{ flex: 2 }}><Input label="Path" value={ss.wsSettings?.path || "/"} onChange={v => set("streamSettings.wsSettings.path", v)} fullWidth mono /></div>
                    <div style={{ flex: 2 }}><Input label="Host" value={ss.wsSettings?.headers?.Host || ""} onChange={v => set("streamSettings.wsSettings.headers.Host", v)} fullWidth /></div>
                  </Row>
                </div>
              )}
              {ss.network === "xhttp" && (
                <div style={{ background: "var(--color-background-secondary)", borderRadius: 8, padding: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "var(--color-text-secondary)", marginBottom: 8 }}>XHTTP</div>
                  <Row>
                    <div style={{ flex: 2 }}><Input label="Path" value={ss.xhttpSettings?.path || "/"} onChange={v => set("streamSettings.xhttpSettings.path", v)} fullWidth mono /></div>
                    <div style={{ flex: 1 }}><Input label="Mode" value={ss.xhttpSettings?.mode || "auto"} options={["auto","stream-one","stream-up","packet-up"]} onChange={v => set("streamSettings.xhttpSettings.mode", v)} fullWidth /></div>
                    <div style={{ flex: 2 }}><Input label="Host" value={ss.xhttpSettings?.host || ""} onChange={v => set("streamSettings.xhttpSettings.host", v)} fullWidth /></div>
                  </Row>
                </div>
              )}
            </>
          );
        })()}

        {(proto === "socks" || proto === "http" || proto === "https") && (() => {
          const srv = out.settings?.servers?.[0] || {};
          const user = srv.users?.[0] || {};
          return (
            <Row>
              <div style={{ flex: 2 }}><Input label="Server" value={srv.address || ""} onChange={v => { const c = clone(out); if (!c.settings.servers) c.settings.servers = [{}]; c.settings.servers[0].address = v; onChange(c); }} fullWidth /></div>
              <div style={{ flex: 1 }}><Input label="Port" value={srv.port || ""} type="number" onChange={v => { const c = clone(out); c.settings.servers[0].port = +v; onChange(c); }} fullWidth /></div>
              <div style={{ flex: 1 }}><Input label="User" value={user.user || ""} onChange={v => { const c = clone(out); if (!c.settings.servers[0].users) c.settings.servers[0].users = [{}]; c.settings.servers[0].users[0].user = v; onChange(c); }} fullWidth /></div>
              <div style={{ flex: 1 }}><Input label="Pass" value={user.pass || ""} onChange={v => { const c = clone(out); c.settings.servers[0].users[0].pass = v; onChange(c); }} fullWidth /></div>
            </Row>
          );
        })()}
      </Sec>
    </Card>
  );
}

// ── RuleCard ───────────────────────────────────────────────────────────────────
function RuleCard({ rule, inTags, outbounds, onChange, onDelete }) {
  const set = (k, v) => onChange({ ...rule, [k]: v });
  const selectedIn = rule.inboundTag || [];
  const selectedOut = rule.outboundTag || "";
  const outbound = outbounds.find(o => o.tag === selectedOut);
  const outColor = outbound ? protoColor(outbound.protocol) : "#6366f1";

  const toggleIn = (tag) => {
    const next = selectedIn.includes(tag) ? selectedIn.filter(t => t !== tag) : [...selectedIn, tag];
    set("inboundTag", next);
  };

  return (
    <Card style={{ borderLeft: `3px solid ${outColor}55` }}>
      <Sec>
        <div style={{ display: "flex", alignItems: "stretch", gap: 0 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--color-text-secondary)", marginBottom: 6 }}>
              Inbounds {selectedIn.length === 0 && <span style={{ color: "#f59e0b", fontWeight: 400 }}>(все)</span>}
            </div>
            {inTags.length === 0
              ? <div style={{ fontSize: 12, color: "var(--color-text-secondary)", fontStyle: "italic" }}>Нет inbound'ов</div>
              : inTags.map(tag => {
                const checked = selectedIn.includes(tag);
                return (
                  <label key={tag} onClick={() => toggleIn(tag)} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", padding: "5px 10px", borderRadius: 7, border: `1px solid ${checked ? "#6366f1" : "var(--color-border-tertiary)"}`, background: checked ? "#6366f111" : "var(--color-background-secondary)", transition: "all .12s", marginBottom: 4 }}>
                    <div style={{ width: 16, height: 16, borderRadius: 4, border: `1.5px solid ${checked ? "#6366f1" : "var(--color-border-secondary)"}`, background: checked ? "#6366f1" : "transparent", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {checked && <span style={{ color: "#fff", fontSize: 11, lineHeight: 1 }}>✓</span>}
                    </div>
                    <span style={{ fontFamily: "monospace", fontSize: 12, color: checked ? "var(--color-text-primary)" : "var(--color-text-secondary)" }}>{tag}</span>
                  </label>
                );
              })}
          </div>

          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 16px", flexShrink: 0 }}>
            <div style={{ width: 1, flex: 1, background: "var(--color-border-tertiary)" }} />
            <div style={{ fontSize: 20, color: outColor, lineHeight: 1, padding: "6px 0" }}>→</div>
            <div style={{ width: 1, flex: 1, background: "var(--color-border-tertiary)" }} />
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--color-text-secondary)", marginBottom: 6 }}>Outbound</div>
            {outbounds.map(out => {
              const selected = out.tag === selectedOut;
              const col = protoColor(out.protocol);
              return (
                <label key={out.tag} onClick={() => set("outboundTag", out.tag)} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", padding: "5px 10px", borderRadius: 7, border: `1px solid ${selected ? col : "var(--color-border-tertiary)"}`, background: selected ? col + "11" : "var(--color-background-secondary)", transition: "all .12s", marginBottom: 4 }}>
                  <div style={{ width: 16, height: 16, borderRadius: "50%", border: `1.5px solid ${selected ? col : "var(--color-border-secondary)"}`, background: selected ? col : "transparent", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {selected && <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#fff" }} />}
                  </div>
                  <span style={{ fontFamily: "monospace", fontSize: 12, color: selected ? col : "var(--color-text-secondary)", flex: 1 }}>{out.tag}</span>
                  <span style={{ fontSize: 10, color: col, fontWeight: 600 }}>{out.protocol}</span>
                </label>
              );
            })}
          </div>

          <div style={{ display: "flex", alignItems: "flex-start", paddingLeft: 12, paddingTop: 22 }}>
            <Btn danger onClick={onDelete}>✕</Btn>
          </div>
        </div>

        <details>
          <summary style={{ fontSize: 12, color: "var(--color-text-secondary)", cursor: "pointer", userSelect: "none", listStyle: "none", display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 10 }}>▶</span> Фильтры domain / IP / protocol
          </summary>
          <div style={{ marginTop: 8 }}>
            <Row>
              <div style={{ flex: 2 }}><Input label="Domain" value={(rule.domain || []).join(",")} onChange={v => set("domain", v ? v.split(",").map(s => s.trim()).filter(Boolean) : [])} fullWidth mono placeholder="geosite:private, example.com" /></div>
              <div style={{ flex: 2 }}><Input label="IP" value={(rule.ip || []).join(",")} onChange={v => set("ip", v ? v.split(",").map(s => s.trim()).filter(Boolean) : [])} fullWidth mono placeholder="geoip:private" /></div>
              <div style={{ flex: 1 }}><Input label="Protocol" value={(rule.protocol || []).join(",")} onChange={v => set("protocol", v ? v.split(",").map(s => s.trim()).filter(Boolean) : [])} fullWidth placeholder="bittorrent" /></div>
            </Row>
          </div>
        </details>
      </Sec>
    </Card>
  );
}

// ── RoutesViz ──────────────────────────────────────────────────────────────────
function RoutesViz({ config }) {
  const inbounds = config.inbounds || [];
  const outbounds = config.outbounds || [];
  const rules = config.routing?.rules || [];
  const containerRef = useRef(null);
  const [containerW, setContainerW] = useState(700);

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect.width;
      if (w) setContainerW(w);
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // Measure longest tag to determine column width
  const charW = 7; // approx px per monospace char at font-size 10
  const maxInTag = Math.max(...inbounds.map(b => b.tag.length), 8);
  const maxOutTag = Math.max(...outbounds.map(o => o.tag.length), 8);
  const COL_PAD = 20;
  const COL_H = 48, GAP_Y = 12, MARGIN = 16;
  const COL_W_IN  = Math.max(140, maxInTag  * charW + COL_PAD * 2);
  const COL_W_OUT = Math.max(140, maxOutTag * charW + COL_PAD * 2);
  const GAP_X = Math.max(60, containerW - COL_W_IN - COL_W_OUT - MARGIN * 2);

  const W = COL_W_IN + GAP_X + COL_W_OUT + MARGIN * 2;
  const IN_X  = MARGIN;
  const OUT_X = MARGIN + COL_W_IN + GAP_X;
  const MID_X = MARGIN + COL_W_IN + GAP_X / 2;

  const inY  = inbounds.map((_, i)  => MARGIN + i * (COL_H + GAP_Y));
  const outY = outbounds.map((_, i) => MARGIN + i * (COL_H + GAP_Y));
  const totalH = Math.max(
    inbounds.length  * (COL_H + GAP_Y) + MARGIN,
    outbounds.length * (COL_H + GAP_Y) + MARGIN
  ) + 60;

  const edges = [];
  rules.forEach(rule => {
    if (!rule.outboundTag) return;
    const outIdx = outbounds.findIndex(o => o.tag === rule.outboundTag);
    if (outIdx < 0) return;
    const inTagList = rule.inboundTag || [];
    if (inTagList.length > 0) {
      inTagList.forEach(tag => {
        const inIdx = inbounds.findIndex(b => b.tag === tag);
        if (inIdx >= 0) edges.push({ inIdx, outIdx, rule });
      });
    } else {
      inbounds.forEach((_, inIdx) => {
        if (!edges.find(e => e.inIdx === inIdx)) edges.push({ inIdx, outIdx, rule, implied: true });
      });
    }
  });

  const edgeColor = (e) => {
    const t = e.rule?.outboundTag;
    if (t === "BLOCK") return "#ef4444";
    if (t === "DIRECT") return "#22c55e";
    return "#6366f1";
  };

  return (
    <div ref={containerRef} style={{ width: "100%", overflowX: "auto" }}>
      <svg width={W} height={totalH} viewBox={`0 0 ${W} ${totalH}`} style={{ display: "block", minWidth: 400 }}>
        <defs>
          <marker id="va" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M2 1L8 5L2 9" fill="none" stroke="context-stroke" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </marker>
        </defs>

        {/* Edges */}
        {edges.map((e, i) => {
          const x1 = IN_X + COL_W_IN, y1 = inY[e.inIdx] + COL_H / 2;
          const x2 = OUT_X,           y2 = outY[e.outIdx] + COL_H / 2;
          const mx = (x1 + x2) / 2;
          return <path key={i}
            d={`M${x1} ${y1} C${mx} ${y1} ${mx} ${y2} ${x2} ${y2}`}
            fill="none" stroke={edgeColor(e)}
            strokeWidth={e.implied ? 0.5 : 1.5}
            strokeDasharray={e.implied ? "4 4" : "none"}
            opacity={e.implied ? 0.25 : 0.75}
            markerEnd="url(#va)" />;
        })}

        {/* Inbound nodes */}
        {inbounds.map((inb, i) => {
          const col = protoColor(inb.protocol);
          return (
            <g key={inb.tag}>
              <rect x={IN_X} y={inY[i]} width={COL_W_IN} height={COL_H} rx={8} fill={col + "18"} stroke={col} strokeWidth={0.75} />
              <text x={IN_X + COL_PAD} y={inY[i] + 17} style={{ fontSize: 10, fontWeight: 700, fill: col, fontFamily: "monospace" }}>
                {inb.protocol.toUpperCase()}
              </text>
              <text x={IN_X + COL_PAD} y={inY[i] + 33} style={{ fontSize: 10, fill: "var(--color-text-secondary)", fontFamily: "monospace" }}>
                {inb.tag}
              </text>
            </g>
          );
        })}

        {/* Outbound nodes */}
        {outbounds.map((out, i) => {
          const col = protoColor(out.protocol);
          return (
            <g key={out.tag}>
              <rect x={OUT_X} y={outY[i]} width={COL_W_OUT} height={COL_H} rx={8} fill={col + "18"} stroke={col} strokeWidth={0.75} />
              <text x={OUT_X + COL_PAD} y={outY[i] + 17} style={{ fontSize: 10, fontWeight: 700, fill: col, fontFamily: "monospace" }}>
                {out.protocol.toUpperCase()}
              </text>
              <text x={OUT_X + COL_PAD} y={outY[i] + 33} style={{ fontSize: 10, fill: "var(--color-text-secondary)", fontFamily: "monospace" }}>
                {out.tag}
              </text>
            </g>
          );
        })}

        {/* Footer labels */}
        <text x={IN_X} y={totalH - 32} style={{ fontSize: 11, fill: "var(--color-text-secondary)" }}>← INBOUNDS</text>
        <text x={OUT_X + COL_W_OUT} y={totalH - 32} textAnchor="end" style={{ fontSize: 11, fill: "var(--color-text-secondary)" }}>OUTBOUNDS →</text>

        {/* Legend */}
        <line x1={MID_X - 90} y1={totalH - 18} x2={MID_X - 60} y2={totalH - 18} stroke="#22c55e" strokeWidth={1.5} markerEnd="url(#va)" />
        <text x={MID_X - 54} y={totalH - 14} style={{ fontSize: 10, fill: "#22c55e" }}>DIRECT</text>
        <line x1={MID_X}      y1={totalH - 18} x2={MID_X + 30} y2={totalH - 18} stroke="#ef4444" strokeWidth={1.5} markerEnd="url(#va)" />
        <text x={MID_X + 36}  y={totalH - 14} style={{ fontSize: 10, fill: "#ef4444" }}>BLOCK</text>
        <line x1={MID_X + 90} y1={totalH - 18} x2={MID_X + 120} y2={totalH - 18} stroke="#6366f1" strokeWidth={1.5} markerEnd="url(#va)" />
        <text x={MID_X + 126} y={totalH - 14} style={{ fontSize: 10, fill: "#6366f1" }}>PROXY</text>
      </svg>
    </div>
  );
}

// ── Validator ──────────────────────────────────────────────────────────────────
function validateConfig(cfg) {
  const errors = [], warns = [];
  if (!cfg || typeof cfg !== "object") { errors.push("Конфиг не является объектом"); return { errors, warns }; }
  const inbounds = cfg.inbounds || [], outbounds = cfg.outbounds || [], rules = cfg.routing?.rules || [];
  const ports = {};
  inbounds.forEach((inb, i) => {
    const loc = `inbounds[${i}] (${inb.tag || "no tag"})`;
    if (!inb.tag) errors.push(`${loc}: нет tag`);
    if (!inb.port) errors.push(`${loc}: нет port`);
    else if (ports[inb.port]) warns.push(`${loc}: порт ${inb.port} уже занят`);
    else ports[inb.port] = inb.tag;
    const ss = inb.streamSettings;
    if (ss?.security === "reality") {
      if (!ss.realitySettings?.privateKey) errors.push(`${loc}: REALITY — пустой privateKey`);
      if (!ss.realitySettings?.dest) errors.push(`${loc}: REALITY — пустой dest`);
    }
    if (inb.protocol === "vless") {
      (inb.settings?.clients || []).forEach((cl, ci) => {
        if (!cl.id) errors.push(`${loc} client[${ci}]: пустой UUID`);
        if ((ss?.security === "reality" || ss?.security === "tls") && !cl.flow) warns.push(`${loc} client[${ci}]: нет flow (рекомендуется xtls-rprx-vision)`);
      });
    }
  });
  if (outbounds.length === 0) errors.push("Нет ни одного outbound");
  const outTags = new Set(outbounds.map(o => o.tag));
  const inTags = new Set(inbounds.map(b => b.tag));
  outbounds.forEach((out, i) => {
    const loc = `outbounds[${i}] (${out.tag || "no tag"})`;
    if (!out.tag) errors.push(`${loc}: нет tag`);
    if (out.protocol === "vless") {
      if (!out.settings?.vnext?.[0]?.address) errors.push(`${loc}: пустой адрес сервера`);
      if (!out.settings?.vnext?.[0]?.users?.[0]?.id) errors.push(`${loc}: пустой UUID`);
      if (out.streamSettings?.security === "reality" && !out.streamSettings?.realitySettings?.publicKey) errors.push(`${loc}: REALITY — пустой publicKey`);
    }
  });
  rules.forEach((rule, i) => {
    if (!rule.outboundTag) errors.push(`rule[${i}]: нет outboundTag`);
    else if (!outTags.has(rule.outboundTag)) errors.push(`rule[${i}]: outboundTag "${rule.outboundTag}" не существует`);
    (rule.inboundTag || []).forEach(tag => { if (!inTags.has(tag)) warns.push(`rule[${i}]: inboundTag "${tag}" не найден`); });
  });
  return { errors, warns };
}

// ── JsonTab ────────────────────────────────────────────────────────────────────
function JsonTab({ config, onImport }) {
  const [text, setText] = useState(() => JSON.stringify(config, null, 2));
  const [parseErr, setParseErr] = useState(null);
  const [validResult, setValidResult] = useState(null);
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  const [applied, setApplied] = useState(false);
  const taRef = useRef(null);

  useEffect(() => { setText(JSON.stringify(config, null, 2)); setParseErr(null); setValidResult(null); }, [config]);

  const tryParse = () => { try { return { ok: true, cfg: JSON.parse(text) }; } catch (e) { return { ok: false, msg: e.message }; } };

  const handleApply = () => { const r = tryParse(); if (!r.ok) { setParseErr(r.msg); return; } setParseErr(null); onImport(r.cfg); setApplied(true); setTimeout(() => setApplied(false), 1800); };
  const handleValidate = () => { const r = tryParse(); if (!r.ok) { setParseErr(r.msg); setValidResult(null); return; } setParseErr(null); setValidResult(validateConfig(r.cfg)); };
  const handleFormat = () => { const r = tryParse(); if (!r.ok) { setParseErr(r.msg); return; } setText(JSON.stringify(r.cfg, null, 2)); setParseErr(null); };
  const handleCopy = () => { navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }); };
  const handleDownload = () => {
    const blob = new Blob([text], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "config.json"; a.click(); URL.revokeObjectURL(url);
    setSaved(true); setTimeout(() => setSaved(false), 1800);
  };

  const lines = text.split("\n").length;
  const allOk = validResult && validResult.errors.length === 0 && validResult.warns.length === 0;
  const hasErrors = validResult && validResult.errors.length > 0;

  return (
    <Sec>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", background: "var(--color-background-secondary)", borderRadius: 10, padding: "10px 14px", border: "0.5px solid var(--color-border-tertiary)" }}>
        <Btn onClick={handleApply} variant="primary">{applied ? "✓ Применено" : "↑ Применить"}</Btn>
        <Btn onClick={handleValidate}>🔍 Проверить</Btn>
        <Btn onClick={handleFormat}>⇌ Форматировать</Btn>
        <div style={{ width: 1, height: 24, background: "var(--color-border-tertiary)" }} />
        <Btn onClick={handleCopy}>{copied ? "✓ Скопировано" : "⎘ Копировать"}</Btn>
        <Btn onClick={handleDownload} variant={saved ? "primary" : "ghost"}>{saved ? "✓ Скачано" : "⬇ Скачать config.json"}</Btn>
      </div>

      {parseErr && (
        <div style={{ background: "#ef444418", border: "1px solid #ef444455", borderRadius: 8, padding: "10px 14px" }}>
          <div style={{ fontWeight: 600, color: "#ef4444", fontSize: 13, marginBottom: 4 }}>⚠ Ошибка синтаксиса JSON</div>
          <div style={{ fontFamily: "monospace", fontSize: 12, color: "#ef4444" }}>{parseErr}</div>
        </div>
      )}

      {validResult && (
        <div style={{ background: allOk ? "#22c55418" : hasErrors ? "#ef444412" : "#f59e0b12", border: `1px solid ${allOk ? "#22c55455" : hasErrors ? "#ef444440" : "#f59e0b40"}`, borderRadius: 8, padding: "12px 14px" }}>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8, color: allOk ? "#22c554" : hasErrors ? "#ef4444" : "#f59e0b" }}>
            {allOk ? "✓ Конфиг валиден" : hasErrors ? `✗ Ошибок: ${validResult.errors.length}` : `⚠ Предупреждений: ${validResult.warns.length}`}
          </div>
          {validResult.errors.map((e, i) => <div key={i} style={{ display: "flex", gap: 8, marginBottom: 4 }}><span style={{ color: "#ef4444", fontWeight: 700, fontSize: 12, flexShrink: 0 }}>✗</span><span style={{ fontFamily: "monospace", fontSize: 12 }}>{e}</span></div>)}
          {validResult.warns.map((w, i) => <div key={i} style={{ display: "flex", gap: 8, marginBottom: 4 }}><span style={{ color: "#f59e0b", fontWeight: 700, fontSize: 12, flexShrink: 0 }}>⚠</span><span style={{ fontFamily: "monospace", fontSize: 12, color: "var(--color-text-secondary)" }}>{w}</span></div>)}
        </div>
      )}

      <div style={{ position: "relative" }}>
        <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 44, padding: "12px 8px 12px 0", textAlign: "right", fontFamily: "monospace", fontSize: 12, lineHeight: "1.6", color: "var(--color-text-secondary)", userSelect: "none", pointerEvents: "none", opacity: 0.4, overflow: "hidden" }}>
          {Array.from({ length: lines }, (_, i) => <div key={i}>{i + 1}</div>)}
        </div>
        <textarea ref={taRef} value={text} onChange={e => { setText(e.target.value); setParseErr(null); setValidResult(null); }} spellCheck={false}
          onKeyDown={e => { if (e.key === "Tab") { e.preventDefault(); const s = e.target.selectionStart, en = e.target.selectionEnd; const nt = text.slice(0, s) + "  " + text.slice(en); setText(nt); requestAnimationFrame(() => { e.target.selectionStart = e.target.selectionEnd = s + 2; }); } }}
          style={{ width: "100%", minHeight: 520, fontFamily: "monospace", fontSize: 12, background: "var(--color-background-secondary)", border: parseErr ? "1px solid #ef4444" : "1px solid var(--color-border-tertiary)", borderRadius: 8, padding: "12px 12px 12px 52px", color: "var(--color-text-primary)", resize: "vertical", boxSizing: "border-box", lineHeight: "1.6", outline: "none" }} />
      </div>
      <div style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>Tab = 2 пробела</div>
    </Sec>
  );
}

// ── DragList ───────────────────────────────────────────────────────────────────
function DragHandle() {
  return (
    <div style={{
      position: "absolute", top: 8, left: 8,
      width: 20, height: 20, borderRadius: 5,
      display: "flex", alignItems: "center", justifyContent: "center",
      cursor: "grab", opacity: 0.3, transition: "opacity .15s",
      color: "var(--color-text-secondary)", fontSize: 14, userSelect: "none",
      zIndex: 2, letterSpacing: "-1px",
    }}
      onMouseEnter={e => e.currentTarget.style.opacity = 1}
      onMouseLeave={e => e.currentTarget.style.opacity = 0.3}
    >
      ⠿
    </div>
  );
}

function DragList({ items, onReorder, renderItem }) {
  const dragIdx = useRef(null);
  const [overIdx, setOverIdx] = useState(null);

  const onDragStart = (e, i) => {
    dragIdx.current = i;
    e.dataTransfer.effectAllowed = "move";
    // transparent drag image
    const ghost = document.createElement("div");
    ghost.style.cssText = "position:fixed;top:-9999px;opacity:0";
    document.body.appendChild(ghost);
    e.dataTransfer.setDragImage(ghost, 0, 0);
    setTimeout(() => document.body.removeChild(ghost), 0);
  };

  const onDragOver = (e, i) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setOverIdx(i);
  };

  const onDrop = (e, i) => {
    e.preventDefault();
    const from = dragIdx.current;
    if (from === null || from === i) { setOverIdx(null); return; }
    const next = [...items];
    const [moved] = next.splice(from, 1);
    next.splice(i, 0, moved);
    onReorder(next);
    dragIdx.current = null;
    setOverIdx(null);
  };

  const onDragEnd = () => { dragIdx.current = null; setOverIdx(null); };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {items.map((item, i) => (
        <div key={i}
          draggable
          onDragStart={e => onDragStart(e, i)}
          onDragOver={e => onDragOver(e, i)}
          onDrop={e => onDrop(e, i)}
          onDragEnd={onDragEnd}
          style={{
            position: "relative",
            transition: "transform .15s, opacity .15s",
            opacity: dragIdx.current === i ? 0.4 : 1,
            transform: overIdx === i && dragIdx.current !== i ? "translateY(-3px)" : "none",
            outline: overIdx === i && dragIdx.current !== i ? "2px solid #6366f155" : "none",
            borderRadius: 12,
          }}>
          <DragHandle />
          {renderItem(item, i)}
        </div>
      ))}
    </div>
  );
}

// ── Theme tokens ───────────────────────────────────────────────────────────────
const THEMES = {
  dark: {
    "--bg-base":       "#0f1117",
    "--bg-primary":    "#161b27",
    "--bg-secondary":  "#1e2535",
    "--bg-tertiary":   "#0f1117",
    "--border-main":   "#2a3347",
    "--border-soft":   "#1e2a3d",
    "--text-primary":  "#e8edf5",
    "--text-secondary":"#7a8ba8",
    "--text-muted":    "#4a5568",
  },
  light: {
    "--bg-base":       "#f5f7fb",
    "--bg-primary":    "#ffffff",
    "--bg-secondary":  "#f0f2f8",
    "--bg-tertiary":   "#e8ecf4",
    "--border-main":   "#d0d7e8",
    "--border-soft":   "#e2e8f0",
    "--text-primary":  "#1a202c",
    "--text-secondary":"#4a5568",
    "--text-muted":    "#a0aec0",
  }
};

function useTheme() {
  const [mode, setMode] = useState("auto"); // auto | dark | light
  const [sysDark, setSysDark] = useState(() => window.matchMedia("(prefers-color-scheme: dark)").matches);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = e => setSysDark(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const isDark = mode === "auto" ? sysDark : mode === "dark";
  const tokens = isDark ? THEMES.dark : THEMES.light;
  return { mode, setMode, isDark, tokens };
}

function ThemeToggle({ mode, setMode, isDark }) {
  const opts = [
    { id: "auto", icon: "⚙", label: "Авто" },
    { id: "light", icon: "☀", label: "Светлая" },
    { id: "dark", icon: "🌙", label: "Тёмная" },
  ];
  return (
    <div style={{ display: "flex", gap: 2, background: isDark ? "#ffffff12" : "#00000010", borderRadius: 8, padding: 3 }}>
      {opts.map(o => (
        <button key={o.id} onClick={() => setMode(o.id)} title={o.label}
          style={{ border: "none", borderRadius: 6, padding: "4px 8px", cursor: "pointer", fontSize: 13,
            background: mode === o.id ? (isDark ? "#ffffff20" : "#ffffff") : "transparent",
            color: mode === o.id ? (isDark ? "#e8edf5" : "#1a202c") : (isDark ? "#7a8ba8" : "#4a5568"),
            boxShadow: mode === o.id ? "0 1px 3px #0002" : "none",
            transition: "all .15s" }}>
          {o.icon}
        </button>
      ))}
    </div>
  );
}

// ── App ────────────────────────────────────────────────────────────────────────
export default function App() {
  const { mode, setMode, isDark, tokens } = useTheme();
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [tab, setTab] = useState("inbounds");
  const [importText, setImportText] = useState("");
  const [showImport, setShowImport] = useState(false);
  const [importErr, setImportErr] = useState(null);
  const [toasts, setToasts] = useState([]);

  const showToast = (msg, type = "success") => {
    const id = Date.now();
    setToasts(t => [...t, { id, msg, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 2500);
  };

  const T = tokens; // shorthand

  const tabs = [
    { id: "inbounds", label: "Inbounds", count: config.inbounds.length },
    { id: "outbounds", label: "Outbounds", count: config.outbounds.length },
    { id: "routing", label: "Routing", count: config.routing.rules.length },
    { id: "global", label: "Global" },
    { id: "routes_viz", label: "Routes Map" },
    { id: "json", label: "JSON" },
  ];

  const updInb = (i, v) => setConfig(c => { const x = clone(c); x.inbounds[i] = v; return x; });
  const delInb = (i) => setConfig(c => { const x = clone(c); x.inbounds.splice(i, 1); return x; });
  const updOut = (i, v) => setConfig(c => { const x = clone(c); x.outbounds[i] = v; return x; });
  const delOut = (i) => setConfig(c => { const x = clone(c); x.outbounds.splice(i, 1); return x; });
  const addRule = () => setConfig(c => ({ ...c, routing: { ...c.routing, rules: [...c.routing.rules, { type: "field", inboundTag: [], outboundTag: "DIRECT" }] } }));
  const updRule = (i, v) => setConfig(c => { const x = clone(c); x.routing.rules[i] = v; return x; });
  const delRule = (i) => setConfig(c => { const x = clone(c); x.routing.rules.splice(i, 1); return x; });
  const moveRule = (i, dir) => setConfig(c => { const x = clone(c); const r = x.routing.rules; [r[i], r[i + dir]] = [r[i + dir], r[i]]; return x; });

  const doImport = () => { try { setConfig(JSON.parse(importText)); setShowImport(false); setImportErr(null); setImportText(""); } catch (e) { setImportErr(e.message); } };

  const inTags = config.inbounds.map(b => b.tag);

  // inject CSS vars into root style
  const rootStyle = {
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    color: T["--text-primary"],
    background: T["--bg-base"],
    minHeight: "100vh",
    padding: 16,
    boxSizing: "border-box",
    // map our tokens to the CSS var names used in subcomponents
    "--color-text-primary":          T["--text-primary"],
    "--color-text-secondary":        T["--text-secondary"],
    "--color-background-primary":    T["--bg-primary"],
    "--color-background-secondary":  T["--bg-secondary"],
    "--color-background-tertiary":   T["--bg-tertiary"],
    "--color-border-secondary":      T["--border-main"],
    "--color-border-tertiary":       T["--border-soft"],
    "--font-sans": "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  };

  return (
    <div style={rootStyle}>
      <div style={{ maxWidth: 860, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, paddingBottom: 12, borderBottom: `0.5px solid ${T["--border-main"]}` }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.02em", color: T["--text-primary"] }}>
              <span style={{ color: "#6366f1" }}>Xray</span> Config Editor
            </div>
            <div style={{ fontSize: 12, color: T["--text-secondary"], marginTop: 2 }}>{config.inbounds.length} inbound · {config.outbounds.length} outbound · {config.routing.rules.length} rules</div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <ThemeToggle mode={mode} setMode={setMode} isDark={isDark} />
            <Btn onClick={() => setShowImport(v => !v)} variant="primary">{showImport ? "× Отмена" : "⬆ Импорт JSON"}</Btn>
          </div>
        </div>

        {/* Import panel */}
        {showImport && (
          <Card style={{ marginBottom: 16, border: "1px solid #6366f155" }}>
            <div style={{ marginBottom: 8, fontSize: 13, color: T["--text-secondary"] }}>Вставьте существующий конфиг JSON</div>
            <textarea value={importText} onChange={e => setImportText(e.target.value)} placeholder={"{\n  \"inbounds\": [...]\n}"} style={{ width: "100%", height: 180, fontFamily: "monospace", fontSize: 12, background: T["--bg-secondary"], border: importErr ? "1px solid #ef4444" : `1px solid ${T["--border-soft"]}`, borderRadius: 8, padding: 10, color: T["--text-primary"], resize: "vertical", boxSizing: "border-box" }} />
            {importErr && <div style={{ color: "#ef4444", fontSize: 12, marginTop: 4 }}>⚠ {importErr}</div>}
            <Row style={{ marginTop: 8 }}>
              <Btn onClick={doImport} variant="primary">Загрузить</Btn>
              <Btn onClick={() => { setShowImport(false); setImportErr(null); }}>Отмена</Btn>
            </Row>
          </Card>
        )}

        {/* Tabs */}
        <div style={{ display: "flex", gap: 4, marginBottom: 16, borderBottom: `0.5px solid ${T["--border-main"]}`, overflowX: "auto" }}>
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{ background: tab === t.id ? T["--bg-secondary"] : "transparent", border: "0.5px solid", borderColor: tab === t.id ? T["--border-main"] : "transparent", borderBottom: tab === t.id ? `0.5px solid ${T["--bg-secondary"]}` : "none", borderRadius: "8px 8px 0 0", padding: "8px 16px", cursor: "pointer", fontSize: 13, fontWeight: tab === t.id ? 600 : 400, color: tab === t.id ? T["--text-primary"] : T["--text-secondary"], position: "relative", top: 1, whiteSpace: "nowrap" }}>
              {t.label}
              {t.count !== undefined && <span style={{ marginLeft: 6, background: tab === t.id ? "#6366f122" : T["--bg-secondary"], color: "#6366f1", borderRadius: 10, padding: "1px 6px", fontSize: 11 }}>{t.count}</span>}
            </button>
          ))}
        </div>

        {/* Inbounds */}
        {tab === "inbounds" && (
          <Sec>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>Добавить:</span>
              {PROTOCOLS_IN.map(p => (
                <Btn key={p} onClick={() => {
                  setConfig(c => ({ ...c, inbounds: [...c.inbounds, buildDefaultInbound(p)] }));
                  showToast(`Inbound ${p} добавлен`);
                }}>
                  <span style={{ width: 8, height: 8, borderRadius: 4, background: protoColor(p), display: "inline-block" }} />{p}
                </Btn>
              ))}
            </div>
            {config.inbounds.length === 0 && <div style={{ textAlign: "center", padding: "40px 0", color: "var(--color-text-secondary)", fontSize: 13 }}>Нет inbound'ов. Добавьте выше.</div>}
            <DragList
              items={config.inbounds}
              onReorder={items => setConfig(c => ({ ...c, inbounds: items }))}
              renderItem={(inb, i) => <InboundCard inb={inb} onChange={v => updInb(i, v)} onDelete={() => delInb(i)} allInbounds={config.inbounds} />}
            />
          </Sec>
        )}

        {/* Outbounds */}
        {tab === "outbounds" && (
          <Sec>
            <AddOutboundPanel onAdd={out => {
              setConfig(c => ({ ...c, outbounds: [...c.outbounds, out] }));
              showToast(`Outbound ${out.protocol} добавлен`);
            }} />
            {config.outbounds.length === 0 && <div style={{ textAlign: "center", padding: "40px 0", color: "var(--color-text-secondary)", fontSize: 13 }}>Нет outbound'ов.</div>}
            <DragList
              items={config.outbounds}
              onReorder={items => setConfig(c => ({ ...c, outbounds: items }))}
              renderItem={(out, i) => <OutboundCard out={out} onChange={v => updOut(i, v)} onDelete={() => delOut(i)} />}
            />
          </Sec>
        )}

        {/* Routing */}
        {tab === "routing" && (
          <Sec>
            <Card title="Стратегия маршрутизации">
              <Input label="Domain Strategy" value={config.routing.domainStrategy || "IPIfNonMatch"} options={DOMAIN_STRATEGY} onChange={v => setConfig(c => ({ ...c, routing: { ...c.routing, domainStrategy: v } }))} />
            </Card>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-secondary)" }}>Правила (выполняются сверху вниз)</span>
              <Btn onClick={addRule} variant="primary">+ Добавить правило</Btn>
            </div>
            {config.routing.rules.length === 0 && <div style={{ textAlign: "center", padding: "30px 0", color: "var(--color-text-secondary)", fontSize: 13 }}>Нет правил. Трафик идёт в первый outbound.</div>}
            {config.routing.rules.map((rule, i) => (
              <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                <div style={{ fontSize: 11, color: "var(--color-text-secondary)", paddingTop: 18, minWidth: 20, textAlign: "right", fontWeight: 600 }}>#{i + 1}</div>
                <div style={{ flex: 1 }}><RuleCard rule={rule} inTags={inTags} outbounds={config.outbounds} onChange={v => updRule(i, v)} onDelete={() => delRule(i)} /></div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4, paddingTop: 14 }}>
                  <Btn disabled={i === 0} onClick={() => moveRule(i, -1)}>↑</Btn>
                  <Btn disabled={i === config.routing.rules.length - 1} onClick={() => moveRule(i, 1)}>↓</Btn>
                </div>
              </div>
            ))}
          </Sec>
        )}

        {/* Global */}
        {tab === "global" && (
          <Sec>
            <Card title="Log">
              <Input label="Log Level" value={config.log?.loglevel || "warning"} options={LOG_LEVELS} onChange={v => setConfig(c => ({ ...c, log: { ...c.log, loglevel: v } }))} />
            </Card>
            <Card title="DNS">
              <Sec>
                <Input label="Query Strategy" value={config.dns?.queryStrategy || "UseIPv4"} options={QUERY_STRATEGY} onChange={v => setConfig(c => ({ ...c, dns: { ...c.dns, queryStrategy: v } }))} />
                <div style={{ fontSize: 11, fontWeight: 600, color: "var(--color-text-secondary)" }}>DNS Servers</div>
                {(config.dns?.servers || []).map((srv, i) => (
                  <Row key={i}>
                    <div style={{ flex: 1 }}><Input value={typeof srv === "string" ? srv : srv.address} mono onChange={v => setConfig(c => { const x = clone(c); if (typeof x.dns.servers[i] === "string") x.dns.servers[i] = v; else x.dns.servers[i].address = v; return x; })} fullWidth /></div>
                    <Btn danger onClick={() => setConfig(c => { const x = clone(c); x.dns.servers.splice(i, 1); return x; })}>✕</Btn>
                  </Row>
                ))}
                <Btn onClick={() => setConfig(c => ({ ...c, dns: { ...c.dns, servers: [...(c.dns?.servers || []), "https://cloudflare-dns.com/dns-query"] } }))}>+ DNS Server</Btn>
              </Sec>
            </Card>
          </Sec>
        )}

        {/* Routes Map */}
        {tab === "routes_viz" && (
          <Sec>
            <div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>Визуальная карта маршрутов. Сплошные линии = явные правила, пунктир = подразумеваемые.</div>
            {config.inbounds.length === 0 && config.outbounds.length === 0
              ? <div style={{ textAlign: "center", padding: "60px 0", color: "var(--color-text-secondary)" }}>Добавьте inbound'ы и outbound'ы.</div>
              : <Card><RoutesViz config={config} /></Card>}
          </Sec>
        )}

        {/* JSON */}
        {tab === "json" && <JsonTab config={config} onImport={cfg => { setConfig(cfg); showToast("Конфиг загружен"); }} />}

      </div>

      {/* Toasts */}
      <div style={{ position: "fixed", bottom: 24, right: 24, display: "flex", flexDirection: "column", gap: 8, zIndex: 9999, pointerEvents: "none" }}>
        {toasts.map(t => (
          <div key={t.id} style={{
            background: t.type === "error" ? "#ef4444" : t.type === "warn" ? "#f59e0b" : "#22c55e",
            color: "#fff", borderRadius: 10, padding: "10px 16px", fontSize: 13, fontWeight: 500,
            boxShadow: "0 4px 20px #0004", display: "flex", alignItems: "center", gap: 8,
            animation: "fadeSlideIn .2s ease",
          }}>
            <span>{t.type === "error" ? "✗" : t.type === "warn" ? "⚠" : "✓"}</span>
            {t.msg}
          </div>
        ))}
      </div>

      <style>{`@keyframes fadeSlideIn { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }`}</style>
    </div>
  );
}

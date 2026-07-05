export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const rint = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

export const USERS = ['a.chen', 'j.rivera', 'm.okafor', 's.patel', 'd.kim', 't.nguyen', 'r.walsh', 'l.gomez', 'k.brooks', 'e.foster'];
export const SVC_ACCOUNTS = ['svc_backup', 'svc_web', 'svc_sql', 'svc_monitor'];
export const HOSTS = ['WKS-0142', 'WKS-0217', 'WKS-0333', 'WKS-0408', 'LT-0071', 'LT-0088', 'SRV-FILE01', 'SRV-WEB02', 'SRV-DC01', 'SRV-APP03'];
export const EXT_IPS = ['185.220.101.34', '45.155.204.17', '91.240.118.72', '103.75.201.4', '194.26.135.119', '80.94.92.11'];
export const C2_IPS = ['147.78.47.93', '5.188.206.54', '176.111.174.62'];
export const DOMAINS_BENIGN = ['login.microsoftonline.com', 'update.windows.com', 'cdn.office.net', 'github.com', 'slack.com', 'fonts.googleapis.com', 'crl.digicert.com'];
export const COUNTRIES = ['Netherlands', 'Romania', 'Brazil', 'Vietnam', 'Ukraine', 'Indonesia'];

export const intIp = () => `10.20.${rint(1, 8)}.${rint(10, 250)}`;

const CONS = 'bcdfghjklmnpqrstvwxz';
export const dgaDomain = () => {
  let s = '';
  for (let i = 0; i < rint(10, 16); i++) s += pick([...CONS, 'a', 'e', 'i', 'o', 'u']);
  return s + pick(['.top', '.xyz', '.info', '.click']);
};

export const rstr = (n) => Math.random().toString(36).slice(2, 2 + n);

export function buildContext() {
  const user = pick(USERS);
  const host = pick(HOSTS.slice(0, 6));
  return {
    user,
    user2: pick(USERS.filter((u) => u !== user)),
    admin_user: pick(['administrator', 'da.admin', 'it.admin']),
    svc_account: pick(SVC_ACCOUNTS),
    new_account: 'svc_' + rstr(5),
    host,
    host2: pick(HOSTS.filter((h) => h !== host)),
    server: pick(HOSTS.slice(6)),
    src_ip: intIp(),
    src_ip2: intIp(),
    attacker_ip: pick(EXT_IPS),
    c2_ip: pick(C2_IPS),
    dga_domain: dgaDomain(),
    dga_domain2: dgaDomain(),
    cloud_domain: pick(['files.dropcloud-sync.example', 'storage.bx-transfer.example', 'share.quickstash.example']),
    country2: pick(COUNTRIES),
    mb: String(rint(350, 950)),
    port: String(rint(40000, 65000)),
    date: new Date().toISOString().slice(0, 10),
  };
}

export const tpl = (str, ctx) =>
  typeof str === 'string' ? str.replace(/\{(\w+)\}/g, (m, k) => (ctx[k] !== undefined ? ctx[k] : m)) : str;

// 브라우저 쪽: 기기에게 패스키 만들기/서명을 시키고, 결과를 서버로 돌려보낸다.
// 개인키는 기기 안에만 있고 이 코드는 개인키를 볼 수 없다.
const $ = (id) => document.getElementById(id);

const b64uToBuf = (s) => {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '='));
  return Uint8Array.from(b, (c) => c.charCodeAt(0)).buffer;
};
const bufToB64u = (buf) => {
  let s = ''; new Uint8Array(buf).forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

async function api(method, url, body) {
  const res = await fetch(url, {
    method, credentials: 'same-origin',
    headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || '요청이 거절됐습니다.'), { status: res.status });
  return data;
}

function say(text, kind = 'info') { const m = $('msg'); m.textContent = text; m.className = 'pk-msg ' + kind; }

function isCancel(e) { return e && (e.name === 'NotAllowedError' || e.name === 'AbortError'); }

async function createPasskey(options) {
  const pk = {
    ...options,
    challenge: b64uToBuf(options.challenge),
    user: { ...options.user, id: b64uToBuf(options.user.id) },
    excludeCredentials: (options.excludeCredentials || []).map((c) => ({ ...c, id: b64uToBuf(c.id) })),
  };
  const cred = await navigator.credentials.create({ publicKey: pk });
  return {
    id: cred.id, rawId: bufToB64u(cred.rawId), type: cred.type,
    authenticatorAttachment: cred.authenticatorAttachment || undefined,
    clientExtensionResults: cred.getClientExtensionResults(),
    response: {
      clientDataJSON: bufToB64u(cred.response.clientDataJSON),
      attestationObject: bufToB64u(cred.response.attestationObject),
      transports: cred.response.getTransports ? cred.response.getTransports() : [],
    },
  };
}

async function signWithPasskey(options) {
  const pk = { ...options, challenge: b64uToBuf(options.challenge),
    allowCredentials: (options.allowCredentials || []).map((c) => ({ ...c, id: b64uToBuf(c.id) })) };
  const cred = await navigator.credentials.get({ publicKey: pk });
  return {
    id: cred.id, rawId: bufToB64u(cred.rawId), type: cred.type,
    clientExtensionResults: cred.getClientExtensionResults(),
    response: {
      clientDataJSON: bufToB64u(cred.response.clientDataJSON),
      authenticatorData: bufToB64u(cred.response.authenticatorData),
      signature: bufToB64u(cred.response.signature),
      userHandle: cred.response.userHandle ? bufToB64u(cred.response.userHandle) : undefined,
    },
  };
}

function el(tag, props = {}, ...kids) {
  const e = Object.assign(document.createElement(tag), props);
  kids.forEach((k) => e.append(k));
  return e;
}

function renderLocked() {
  $('locked-view').hidden = false; $('open-view').hidden = true;
  $('items').replaceChildren(); $('passkeys').replaceChildren();
}

async function renderOpen(user) {
  $('locked-view').hidden = true; $('open-view').hidden = false;
  $('who').textContent = user.name;
  const { items } = await api('GET', '/api/private/items');
  $('item-count').textContent = `(${items.length}개)`;
  $('items').replaceChildren(...(items.length ? items.map((it) =>
    el('div', { className: 'pk-item' },
      el('div', { className: 'pk-kind', textContent: it.kind }),
      el('strong', { textContent: it.title }),
      el('div', { textContent: it.body }),
      el('button', { className: 'pk-danger', textContent: '지우기', onclick: async () => {
        try { await api('DELETE', '/api/private/items/' + it.id); await renderOpen(user); } catch (e) { say(e.message, 'err'); }
      } }))) : [el('p', { className: 'pk-muted', textContent: '아직 메모가 없습니다. 아래에서 첫 메모를 적어 보세요.' })]));
  const { passkeys } = await api('GET', '/api/passkeys');
  $('passkeys').replaceChildren(...passkeys.map((p) =>
    el('div', { className: 'pk-item' },
      el('strong', { textContent: p.name }),
      el('div', { className: 'pk-muted', textContent: `등록한 날짜: ${new Date(p.createdAt).toLocaleString('ko-KR')} · ${p.storageGuess}` }),
      el('button', { className: 'pk-danger', textContent: '이 패스키 지우기', onclick: async () => {
        if (!confirm(`'${p.name}' 패스키를 지울까요? 지운 패스키로는 더 이상 들어올 수 없습니다.`)) return;
        try { await api('DELETE', '/api/passkeys/' + p.id); say(`'${p.name}' 패스키를 지웠습니다.`, 'ok'); await renderOpen(user); }
        catch (e) { say(e.message, 'err'); await renderOpen(user); say(e.message, 'err'); }
      } }))));
}

function showStored(r) {
  const box = $('stored'); box.hidden = false;
  box.replaceChildren(
    el('strong', { textContent: '서버에 저장된 값 (등록 결과)' }),
    el('p', { textContent: r.explanation }),
    el('div', {}, '공개키: ', el('code', { textContent: r.storedOnServer.publicKey })),
    el('div', {}, '패스키 ID: ', el('code', { textContent: r.storedOnServer.credentialId })),
    el('div', { className: 'pk-muted', textContent: `패스키 이름: ${r.passkey.name} · 저장 위치 추정: ${r.storageGuess}` }));
}

async function doRegister() {
  try {
    const signedIn = (await api('GET', '/api/session')).loggedIn;
    const body = signedIn ? { passkeyName: $('pk2-name').value } : { name: $('reg-name').value, passkeyName: $('reg-passkey-name').value };
    const options = await api('POST', '/api/register/options', body);
    say('기기의 안내에 따라 패스키를 만들어 주세요…');
    let response;
    try { response = await createPasskey(options); }
    catch (e) {
      if (isCancel(e)) return say('패스키 만들기가 취소됐습니다. 계정과 패스키는 저장되지 않았습니다. (서버가 낸 임시 질문은 5분 뒤 저절로 사라집니다.)', 'err');
      if (e.name === 'InvalidStateError') return say('이 기기에는 이미 이 계정의 패스키가 등록돼 있습니다. 다른 기기나 다른 보안 키로 등록해 보세요.', 'err');
      throw e;
    }
    const r = await api('POST', '/api/register/verify', { response });
    say(r.newAccount ? '패스키를 만들었고 들어왔습니다.' : '두 번째 패스키를 등록했습니다.', 'ok');
    showStored(r);
    await renderOpen(r.user);
  } catch (e) { say(e.message, 'err'); }
}

async function doLogin() {
  try {
    const options = await api('POST', '/api/login/options', {});
    say('기기의 안내에 따라 패스키를 선택해 주세요…');
    let response;
    try { response = await signWithPasskey(options); }
    catch (e) { if (isCancel(e)) return say('패스키 선택이 취소됐습니다. 잠긴 상태 그대로입니다.', 'err'); throw e; }
    const r = await api('POST', '/api/login/verify', { response });
    say(`'${r.passkeyName}' 패스키로 들어왔습니다.`, 'ok');
    $('stored').hidden = true;
    await renderOpen(r.user);
  } catch (e) { say(e.message, 'err'); }
}

$('btn-register').onclick = doRegister;
$('btn-add-passkey').onclick = doRegister;
$('btn-login').onclick = doLogin;
$('btn-logout').onclick = async () => { await api('POST', '/api/logout', {}); $('stored').hidden = true; renderLocked(); say('로그아웃했습니다. 비공개 영역이 다시 잠겼습니다.', 'ok'); };
$('btn-add-item').onclick = async () => {
  try {
    await api('POST', '/api/private/items', { kind: $('it-kind').value, title: $('it-title').value, body: $('it-body').value });
    $('it-title').value = ''; $('it-body').value = '';
    const s = await api('GET', '/api/session'); await renderOpen(s.user); say('메모를 추가했습니다.', 'ok');
  } catch (e) { say(e.message, 'err'); }
};

(async () => {
  if (!window.PublicKeyCredential) say('이 브라우저는 패스키를 지원하지 않습니다. 최신 Chrome·Edge·Safari·Firefox를 사용해 주세요.', 'err');
  try { const s = await api('GET', '/api/session'); if (s.loggedIn) await renderOpen(s.user); else renderLocked(); }
  catch { renderLocked(); }
})();


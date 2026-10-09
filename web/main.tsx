import "./polyfills";
import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  startRegistration,
  startAuthentication,
} from "@simplewebauthn/browser";
import { PasskeyKit, SACClient } from "passkey-kit";
import "./style.css";
type Config = {
  networkPassphrase: string;
  rpcUrl: string;
  walletWasmHash: string;
  tokenContract: string;
  rpId: string;
  googleEnabled: boolean;
  sponsorshipConfigured: boolean;
};
type Wallet = { contract: string; credential: string };
type Profile = {
  email: string;
  wallet: Wallet | null;
  events: { kind: string; hash: string; created: number }[];
};
async function api<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method: body === undefined ? "GET" : "POST",
    credentials: "same-origin",
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const value = await response.json();
  if (!response.ok) throw Error(value.error || "Request failed");
  return value;
}
function amount(value: string) {
  if (!/^\d+(\.\d{1,7})?$/.test(value))
    throw Error("Enter an amount with up to seven decimal places");
  const [whole, fraction = ""] = value.split(".");
  const result = BigInt(whole) * 10000000n + BigInt(fraction.padEnd(7, "0"));
  if (result <= 0n || result > 1000_0000000n)
    throw Error("Send between 0 and 1,000 test XLM");
  return result;
}
function App() {
  const [config, setConfig] = useState<Config>();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [kit, setKit] = useState<PasskeyKit>();
  const [unlocked, setUnlocked] = useState(false);
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [balance, setBalance] = useState("0");
  const [recipient, setRecipient] = useState("");
  const [quantity, setQuantity] = useState("");
  const [tab, setTab] = useState("Overview");
  async function refresh() {
    const me = await api<Profile>("/me");
    setProfile(me);
    if (me.wallet) {
      const result = await api<{ stroops: string }>("/wallet/balance");
      setBalance(
        (Number(result.stroops) / 1e7).toLocaleString("en-US", {
          maximumFractionDigits: 7,
        }),
      );
    }
  }
  async function run(label: string, work: () => Promise<void>) {
    setBusy(label);
    setError("");
    setMessage("");
    try {
      await work();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  useEffect(() => {
    void (async () => {
      try {
        const cfg = await api<Config>("/config");
        setConfig(cfg);
        setKit(new PasskeyKit(cfg));
        const token = new URLSearchParams(location.search).get("login");
        if (token) {
          history.replaceState(null, "", "/");
          await api("/auth/email/verify", { token });
        }
        try {
          await refresh();
        } catch (e) {
          if (token) setError((e as Error).message);
        }
      } catch (e) {
        setError((e as Error).message);
      }
    })();
  }, []);
  async function connect(wallet: Wallet) {
    await kit!.connectWallet({
      keyId: wallet.credential,
      getContractId: async () => wallet.contract,
      verifyWasmHash: true,
    });
    if (kit!.contractId !== wallet.contract) {
      kit!.disconnect();
      throw Error("Wallet address mismatch");
    }
    setUnlocked(true);
  }
  async function create() {
    const options = await api<
      Parameters<typeof startRegistration>[0]["optionsJSON"]
    >("/wallet/registration/options", {});
    const response = await startRegistration({ optionsJSON: options });
    const wallet = await api<Wallet>("/wallet/registration/verify", response);
    await connect(wallet);
    await refresh();
    setMessage("Your Stellar testnet wallet is ready.");
  }
  async function unlock() {
    const options = await api<
      Parameters<typeof startAuthentication>[0]["optionsJSON"]
    >("/wallet/unlock/options", {});
    const response = await startAuthentication({ optionsJSON: options });
    const wallet = await api<Wallet>("/wallet/unlock/verify", response);
    await connect(wallet);
    setMessage("Wallet unlocked. Each payment needs your passkey approval.");
  }
  async function send() {
    if (!unlocked || !profile?.wallet || !config || !kit)
      throw Error("Unlock your wallet first");
    const token = new SACClient(config).getSACClient(config.tokenContract);
    const tx = await token.transfer({
      from: profile.wallet.contract,
      to: recipient.trim(),
      amount: amount(quantity),
    });
    await kit.sign(tx);
    if (!tx.built) throw Error("Payment was not built");
    const result = await api<{ hash: string }>("/wallet/payments", {
      xdr: tx.built.toXDR(),
    });
    setQuantity("");
    setMessage(`Payment confirmed on testnet. Transaction: ${result.hash}`);
    try {
      await refresh();
    } catch {
      setMessage(
        `Payment confirmed on testnet. Transaction: ${result.hash}. Balance refresh is temporarily unavailable.`,
      );
    }
  }
  return (
    <div className="shell">
      <aside>
        <a className="brand" href="/">
          <img src="/logo.png" alt="BlockFinaX" />
          <span>
            BlockFinaX<small>Stellar wallet</small>
          </span>
        </a>
        <div className="network">
          <i /> Stellar testnet
        </div>
        <nav>
          {["Overview", "Send payment", "Activity"].map((item) => (
            <button
              className={tab === item ? "active" : ""}
              onClick={() => setTab(item)}
              key={item}
            >
              {item}
            </button>
          ))}
        </nav>
        <div className="aside-note">
          Build. Test. Integrate.
          <p>A separate environment for BlockFinaX partners and developers.</p>
          <a href="https://docs.blockfinax.com/stellar/">
            Read the Stellar plan ↗
          </a>
        </div>
      </aside>
      <main>
        <header>
          <span>Wallet infrastructure</span>
          <span>{profile?.email || "Partner sandbox"}</span>
        </header>
        <div className="content">
          <div className="title">
            <div>
              <p className="eyebrow">BLOCKFINAX ON STELLAR</p>
              <h1>
                {profile
                  ? "Your testing wallet"
                  : "A familiar wallet. New rails."}
              </h1>
              <p>
                {profile
                  ? "Create an account, receive test funds and approve Stellar payments."
                  : "Sign in with your email or Google. Use a passkey to control your Stellar wallet."}
              </p>
            </div>
            {profile && (
              <button
                className="secondary"
                onClick={() =>
                  void run("Signing out", async () => {
                    await api("/auth/logout", {});
                    kit?.disconnect();
                    setUnlocked(false);
                    setProfile(null);
                  })
                }
              >
                Sign out
              </button>
            )}
          </div>
          <div className="notice">
            Testnet only · Test XLM has no monetary value.
          </div>
          {error && (
            <div role="alert" className="error">
              {error}
            </div>
          )}
          {message && (
            <div role="status" className="success">
              {message}
            </div>
          )}
          {!config?.sponsorshipConfigured && config && (
            <div className="error">
              The testnet fee payer needs configuration before wallets can be
              created.
            </div>
          )}
          {!profile ? (
            <section className="login card">
              <h2>Welcome to BlockFinaX</h2>
              <p>Get started with a Stellar test wallet.</p>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void run("Sending link", async () => {
                    const result = await api<{ message: string }>(
                      "/auth/email",
                      { email },
                    );
                    setMessage(result.message);
                  });
                }}
              >
                <label>
                  Email address
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@company.com"
                  />
                </label>
                <button disabled={!!busy || !config}>
                  {busy || "Email me a sign-in link"}
                </button>
              </form>
              {config?.googleEnabled && (
                <a className="google" href="/api/auth/google">
                  Continue with Google
                </a>
              )}
              <p className="fine">
                Your email identifies your account. Your passkey signs
                transactions.
              </p>
            </section>
          ) : !profile.wallet ? (
            <section className="card create">
              <h2>Create your Stellar wallet</h2>
              <p>
                Your device will ask you to create a passkey. BlockFinaX then
                deploys a smart account on Stellar testnet, with that passkey as
                its signer.
              </p>
              <button
                disabled={!!busy || !config?.sponsorshipConfigured}
                onClick={() => void run("Creating wallet", create)}
              >
                {busy || "Create wallet with a passkey"}
              </button>
              <p className="fine">
                Keep access to your passkey. Email sign-in cannot recover a lost
                signing key.
              </p>
            </section>
          ) : (
            <>
              <div className="grid">
                <section className="card balance">
                  <div className="row">
                    <span>Available test balance</span>
                    <span className="pill">XLM · TESTNET</span>
                  </div>
                  <h2>
                    {balance}
                    <small> test XLM</small>
                  </h2>
                  <div className="actions">
                    <button
                      disabled={!!busy}
                      onClick={() => {
                        setTab("Send payment");
                      }}
                    >
                      Send payment
                    </button>
                    <button
                      className="secondary"
                      disabled={!!busy}
                      onClick={() =>
                        void run("Receiving test funds", async () => {
                          await api("/wallet/faucet", {});
                          await refresh();
                          setMessage("100 test XLM received.");
                        })
                      }
                    >
                      Receive test funds
                    </button>
                  </div>
                  <p className="fine">100 test XLM, once every 24 hours.</p>
                </section>
                <section className="card">
                  <div className="row">
                    <h3>Account security</h3>
                    <span className="pill">
                      {unlocked ? "Unlocked" : "Locked"}
                    </span>
                  </div>
                  <p>Passkey-controlled smart account</p>
                  <button
                    className="secondary"
                    disabled={!!busy}
                    onClick={() => void run("Unlocking", unlock)}
                  >
                    {busy || "Unlock with passkey"}
                  </button>
                  <p className="fine">
                    Every payment requires a separate device approval.
                  </p>
                </section>
              </div>
              <section className="card address">
                <h3>Your Stellar address</h3>
                <code>{profile.wallet.contract}</code>
                <button
                  className="text"
                  onClick={() =>
                    void run("Copying", async () => {
                      await navigator.clipboard.writeText(
                        profile.wallet!.contract,
                      );
                      setMessage("Address copied.");
                    })
                  }
                >
                  Copy address
                </button>
              </section>
              {tab === "Send payment" && (
                <section className="card payment">
                  <h2>Send a test payment</h2>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      void run("Approving payment", send);
                    }}
                  >
                    <label>
                      Recipient Stellar address
                      <input
                        required
                        value={recipient}
                        onChange={(e) => setRecipient(e.target.value)}
                        placeholder="G… or C…"
                      />
                    </label>
                    <label>
                      Amount · test XLM
                      <input
                        required
                        inputMode="decimal"
                        value={quantity}
                        onChange={(e) => setQuantity(e.target.value)}
                        placeholder="10.00"
                      />
                    </label>
                    <button disabled={!!busy || !unlocked}>
                      {busy || "Approve with passkey and send"}
                    </button>
                    {!unlocked && (
                      <p className="fine">Unlock your wallet before sending.</p>
                    )}
                  </form>
                </section>
              )}
              <section className="card">
                <div className="row">
                  <h2>Recent activity</h2>
                  <button
                    className="text"
                    disabled={!!busy}
                    onClick={() => void run("Refreshing", refresh)}
                  >
                    Refresh
                  </button>
                </div>
                {profile.events.length ? (
                  profile.events.map((event, i) => (
                    <div className="event" key={i}>
                      <div>
                        <strong>{event.kind}</strong>
                        <small>
                          {new Date(event.created).toLocaleString()}
                        </small>
                      </div>
                      <a
                        target="_blank"
                        rel="noreferrer"
                        href={`https://stellar.expert/explorer/testnet/tx/${event.hash}`}
                      >
                        View transaction ↗
                      </a>
                    </div>
                  ))
                ) : (
                  <p>No transactions yet.</p>
                )}
              </section>
            </>
          )}
          <footer>BlockFinaX · Connecting Global Trade</footer>
        </div>
      </main>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);


import yfinance as yf
import json
import sys
import os
from datetime import datetime

import curl_cffi.requests as curl_requests

_CACHE_ROOT = "/tmp/yfinance" if os.environ.get("VERCEL") else os.path.join(
    os.path.dirname(__file__), "cache", "yfinance"
)
os.makedirs(_CACHE_ROOT, exist_ok=True)
yf.set_tz_cache_location(_CACHE_ROOT)

# fc.yahoo.com y guce.yahoo.com (cookie/consent, usados internamente por
# yfinance antes de pedir datos) no completan la cadena de certificados en
# esta red — verificado también con `requests` estándar, falla igual.
# query1.finance.yahoo.com (los datos reales) sí verifica correctamente.
# La verificación TLS permanece activa; un certificado inválido no debe
# convertirse en datos de mercado aparentemente confiables.
_SESSION = curl_requests.Session(impersonate="chrome", verify=True)


def fetch_market_data():


    data = {
        "timestamp": datetime.now().isoformat(),
        "bmv": [],
        "porcino": [],
        "gasolina": [],
        "crypto": []
    }
    

    bmv_stocks = [
        {"symbol": "GRUMAB.MX",   "name": "Gruma",   "display": "GRUMA"},
        {"symbol": "BIMBOA.MX",   "name": "Bimbo",   "display": "BIMBO"},
        {"symbol": "FEMSAUBD.MX", "name": "Femsa",   "display": "FEMSA"},
        {"symbol": "WALMEX.MX",   "name": "Walmart", "display": "WALMEX"},
    ]
    
    for stock in bmv_stocks:
        try:
            ticker = yf.Ticker(stock["symbol"], session=_SESSION)
            hist = ticker.history(period="1d")
            if not hist.empty:
                current_price = hist['Close'].iloc[-1]
                prev_price = hist['Open'].iloc[0]
                change_pct = ((current_price - prev_price) / prev_price * 100) if prev_price != 0 else 0
                
                data["bmv"].append({
                    "symbol": stock["display"],
                    "name": stock["name"],
                    "price": round(float(current_price), 2),
                    "change_pct": round(float(change_pct), 2),
                    "type": "stock"
                })
        except Exception as e:
            print(f"Error fetching {stock['symbol']}: {e}", file=sys.stderr)

    porcino_symbols = [
        {"symbol": "HGZ24.CME", "name": "Lean Hogs"},  # 
        {"symbol": "0#LH:", "name": "Lean Hogs Fut"},
    ]
    
    try:
        
        lean_hogs = yf.Ticker("HG=F", session=_SESSION)
        hist = lean_hogs.history(period="1d")
        if not hist.empty:
            current_price = hist['Close'].iloc[-1]
            prev_price = hist['Open'].iloc[0]
            change_pct = ((current_price - prev_price) / prev_price * 100) if prev_price != 0 else 0
            
            data["porcino"].append({
                "symbol": "HG=F",
                "name": "Carne de Cerdo (Futures)",
                "price": round(float(current_price), 4),
                "change_pct": round(float(change_pct), 2),
                "type": "commodity"
            })
    except Exception as e:
        print(f"Error fetching porcino data: {e}", file=sys.stderr)
    
    
    try:
        gas = yf.Ticker("CL=F", session=_SESSION)
        hist = gas.history(period="1d")
        if not hist.empty:
            current_price = hist['Close'].iloc[-1]
            prev_price = hist['Open'].iloc[0]
            change_pct = ((current_price - prev_price) / prev_price * 100) if prev_price != 0 else 0
            
            data["gasolina"].append({
                "symbol": "CL=F",
                "name": "Petróleo WTI",
                "price": round(float(current_price), 2),
                "change_pct": round(float(change_pct), 2),
                "type": "commodity"
            })
    except Exception as e:
        print(f"Error fetching gasolina data: {e}", file=sys.stderr)
    
  
    crypto_symbols = [
        {"symbol": "BTC-USD", "name": "Bitcoin"},
        {"symbol": "ETH-USD", "name": "Ethereum"},
    ]
    
    for crypto in crypto_symbols:
        try:
            ticker = yf.Ticker(crypto["symbol"], session=_SESSION)
            hist = ticker.history(period="1d")
            if not hist.empty:
                current_price = hist['Close'].iloc[-1]
                prev_price = hist['Open'].iloc[0]
                change_pct = ((current_price - prev_price) / prev_price * 100) if prev_price != 0 else 0
                
                data["crypto"].append({
                    "symbol": crypto["symbol"].split("-")[0],
                    "name": crypto["name"],
                    "price": round(float(current_price), 2),
                    "change_pct": round(float(change_pct), 2),
                    "type": "crypto"
                })
        except Exception as e:
            print(f"Error fetching {crypto['symbol']}: {e}", file=sys.stderr)
    
    
    try:
        usdmxn = yf.Ticker("USDMXN=X", session=_SESSION)
        hist = usdmxn.history(period="1d")
        if not hist.empty:
            current_price = hist['Close'].iloc[-1]
            prev_price = hist['Open'].iloc[0]
            change_pct = ((current_price - prev_price) / prev_price * 100) if prev_price != 0 else 0
            
            data["bmv"].append({
                "symbol": "USD/MXN",
                "name": "Tipo de Cambio",
                "price": round(float(current_price), 4),
                "change_pct": round(float(change_pct), 2),
                "type": "currency"
            })
    except Exception as e:
        print(f"Error fetching USD/MXN: {e}", file=sys.stderr)
    
    return data

if __name__ == "__main__":
    try:
        market_data = fetch_market_data()
        if not any(market_data[key] for key in ("bmv", "porcino", "gasolina", "crypto")):
            raise RuntimeError("Yahoo Finance no devolvió datos de mercado")
        print(json.dumps(market_data))
    except Exception as e:
        print(json.dumps({"error": str(e)}), file=sys.stderr)
        sys.exit(1)

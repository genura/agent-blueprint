#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
PROMAN v2.0 - High-Density Terminal Service & Process Monitor
Cyberpunk / DevOps Dashboard for Katalog Sistemi (catApp)
Built with Textual, Rich & psutil
"""

import ctypes
import ctypes.wintypes
import json
import os
import queue
import re
import socket
import subprocess
import sys
import tempfile
import threading
import time
from dataclasses import dataclass
from functools import partial
from datetime import datetime, timedelta
from typing import Optional
from urllib.parse import urlparse

# =====================================================================
# BAGIMLILIK KONTROLU & OTOMATIK KURULUM (AUTO-INSTALL DEPENDENCIES)
# =====================================================================
REQUIRED_PACKAGES = {
    "textual": "textual>=8.0.0",
    "psutil": "psutil>=5.9.0",
    "PIL": "pillow",  # screenshot
    "qrcode": "qrcode",  # Expo QR kodu
}


def ensure_dependencies() -> None:
    """Eksik paketleri otomatik olarak denetler ve pip ile kurar."""
    missing = []
    for module_name, install_spec in REQUIRED_PACKAGES.items():
        try:
            __import__(module_name)
        except ImportError:
            missing.append(install_spec)

    if missing:
        print("=" * 70)
        print("  PROMAN v2.0 - Bagimlilik Denetimi (Self-Healing Bootstrap)")
        print("=" * 70)
        print(f"[*] Sistemde eksik Python paketleri tespit edildi: {', '.join(missing)}")
        print("[*] Paketler otomatik kuruluyor (pip install)... Lutfen bekleyin...\n")
        try:
            cmd = [sys.executable, "-m", "pip", "install", *missing]
            subprocess.check_call(cmd)
            print("\n[+] Tum gerekli paketler basariyla kuruldu!")
            print("[+] PROMAN baslatiliyor...\n")
            time.sleep(1.2)
        except Exception as err:
            print(f"\n[!] Paketler otomatik yuklenirken hata olustu: {err}")
            print(f"[!] Lutfen komut satirindan su komutu manuel calistirin:")
            print(f"    pip install {' '.join(missing)}\n")
            sys.exit(1)


ensure_dependencies()

import psutil
import qrcode
from textual import work
from textual.app import App, ComposeResult
from textual.binding import Binding
from textual.command import CommandPalette, DiscoveryHit, Hit, Hits, Provider
from textual.content import Content
from textual.containers import Container, Horizontal, Vertical
from textual.screen import ModalScreen
from textual.events import Click
from textual.widgets import (
    Button,
    DataTable,
    Header,
    Input,
    Label,
    ListItem,
    ListView,
    Static,
)

# Emojiler ve Turkce kodlama icin Windows stream reconfigure
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass

ANSI_RE = re.compile(r"\x1b\[[0-9;]*m")


def escape(text: str) -> str:
    """Metindeki her koseli parantezi kacirir. textual.markup.escape buyuk harfle baslayanlari ([INFO], [ERROR])
    kacirmiyor; Textual ise bunlari stil etiketi sanip siliyor."""
    return text.replace("[", "\\[")


def plain_of(markup_text: str) -> str:
    """Markup'in ekranda gorunen duz metni (kopyalama ve disk logu icin)."""
    try:
        return Content.from_markup(markup_text).plain
    except Exception:
        return markup_text

def qr_markup(data: str) -> list[str]:
    """Metnin QR kodunu terminal satirlari olarak uretir. Bir satir iki QR satirini tasir (yarim blok karakterler),
    boylece kod kare gorunur. Renkler sabit (beyaz zemin, siyah modul): tema ne olursa olsun kamera okuyabilsin."""
    qr = qrcode.QRCode(border=4, error_correction=qrcode.constants.ERROR_CORRECT_L)
    qr.add_data(data)
    qr.make(fit=True)
    matrix = qr.get_matrix()
    if len(matrix) % 2:
        matrix.append([False] * len(matrix[0]))
    chars = {(True, True): "█", (True, False): "▀", (False, True): "▄", (False, False): " "}
    return [
        "[#000000 on #ffffff]" + "".join(chars[pair] for pair in zip(top, bottom)) + "[/]"
        for top, bottom in zip(matrix[0::2], matrix[1::2])
    ]


DEFAULT_API_PORT = 3003
WEB_PORT = 5003
EXPO_PORT = 8081
# apps/mobile/.env icinde bu satir varsa sunucu adresi elle yazilmistir; otomatik ag adresi esitlemesi yapilmaz.
MANUAL_URL_MARK = "# proman: adres elle secildi"
AUTO_URL = "auto"
DEFAULT_MSSQL_PORT = 1433
ANDROID_PACKAGE = "com.catapp.mobile"
EXPO_GO_PACKAGE = "host.exp.exponent"
# Tablet testi WSA (Windows Subsystem for Android) uzerinde yapilir. Kurulum yeri ve ADB adresi bu makineye ozeldir.
WSA_DIR = os.path.join(os.environ.get("USERPROFILE", ""), "WSA")
WSA_CLIENT = os.path.join(WSA_DIR, "WsaClient", "WsaClient.exe")
WSA_ADB = "127.0.0.1:58526"
WSA_START_URI = "wsa://com.android.settings"  # WsaClient.exe dogrudan calistirilinca baslamaz; protokol gerekir


def copy_to_windows_clipboard(text: str) -> bool:
    """Metni Windows panosuna (clipboard) aktarir."""
    try:
        p = subprocess.Popen("clip", stdin=subprocess.PIPE, shell=True)
        p.communicate(input=text.encode("utf-16le"))
        return p.returncode == 0
    except Exception:
        return False


def is_windows_admin() -> bool:
    try:
        return bool(ctypes.windll.shell32.IsUserAnAdmin())
    except Exception:
        return False


def get_project_root() -> str:
    current = os.path.dirname(os.path.abspath(__file__))
    if os.path.exists(os.path.join(current, "apps")) or os.path.exists(os.path.join(current, "package.json")):
        return current
    parent = os.path.dirname(current)
    if os.path.exists(os.path.join(parent, "apps")) or os.path.exists(os.path.join(parent, "package.json")):
        return parent
    return parent


@dataclass
class Service:
    key: str
    label: str
    cwd: str
    cmd: str
    port: int
    needs_db: bool = False
    startup_wait: float = 4.0
    process: Optional[subprocess.Popen] = None


def tg(name: str) -> str:
    """Log etiketi ([API], [NPM] ...): koseli parantez Textual markup'i sanilmasin diye kacirilir."""
    return f"\\[{name}]"


class ProcessEngine:
    """Port, Process, Android ve Komut Islemleri Motoru."""

    SHORT_PATH_MARK = "catapp-kisa-yol"

    def __init__(self, log_cb, prog_cb, pick_cb) -> None:
        self.log = log_cb
        self.prog = prog_cb
        self.pick = pick_cb
        self.root_dir = get_project_root()
        self.project_name, self.project_version = self._read_project_info()

        self.api_dir = os.path.join(self.root_dir, "apps", "api")
        self.web_dir = os.path.join(self.root_dir, "apps", "web")
        self.mobile_dir = os.path.join(self.root_dir, "apps", "mobile")
        self.agent_dir = os.path.join(self.root_dir, "agent")

        api_env = self._read_env(os.path.join(self.api_dir, ".env"))
        self.api_port = self._to_int(api_env.get("PORT"), DEFAULT_API_PORT)

        # PostgreSQL kontrol bilgisi
        self.db_host, self.db_port = "127.0.0.1", 5432
        try:
            url = urlparse(api_env.get("DATABASE_URL", ""))
            if url.hostname:
                self.db_host = url.hostname
            if url.port:
                self.db_port = url.port
        except ValueError:
            pass

        # MSSQL hedefi (sadece TCP yoklamasi icin). Kaynak dosya degisirse _load_mssql_target yeniden okur.
        self.mssql_host, self.mssql_instance_name, self.mssql_port, self.mssql_db = "", "", DEFAULT_MSSQL_PORT, ""
        self.mssql_source = ""
        self._mssql_sig: Optional[tuple] = None
        self._mssql_inst_port: tuple[float, str, Optional[int]] = (0.0, "", None)
        self._load_mssql_target()

        # Node.js surumu acilista bir kez okunur (detect_node)
        self.node_version: Optional[str] = None

        # WSA (vmmemWSA) ve eski Android Studio emulatoru surecleri; scan_processes doldurur
        self.wsa_pid: Optional[int] = None
        self.old_emulator_pids: list[int] = []

        self.api =Service("api", "API", self.api_dir, "npm run dev", self.api_port, needs_db=True, startup_wait=4)
        self.web = Service("web", "WEB", self.web_dir, "npm run dev", WEB_PORT, startup_wait=5)
        self.mobile = Service("mobile", "MOBIL", self.mobile_dir, f"npx expo start --port {EXPO_PORT}", EXPO_PORT, startup_wait=8)

        # Android SDK
        self.android_sdk = (
            os.environ.get("ANDROID_HOME")
            or os.environ.get("ANDROID_SDK_ROOT")
            or os.path.join(os.environ.get("LOCALAPPDATA", ""), "Android", "Sdk")
        )
        self.adb = os.path.join(self.android_sdk, "platform-tools", "adb.exe")
        self.mobile_env = os.path.join(self.mobile_dir, ".env")

        # Asenkron Islem ve Iptal Kontrolleri
        self.active_subprocess: Optional[subprocess.Popen] = None
        self.cancel_event: threading.Event = threading.Event()
        self.is_task_running: bool = False
        self.active_task_name: str = ""
        self.task_started: float = 0.0
        self._task_lock = threading.Lock()
        self._hold_result: bool = False

        # CPU olcumu icin PID -> psutil.Process (ayni nesne tekrar olculmeli, yoksa hep 0 doner)
        self._procs: dict[int, psutil.Process] = {}

        # Log dosyalari proje kokune degil, proman.py'nin yanindaki log/ klasorune yazilir (write_disk_log).
        self.log_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "log")
        self._disk_log_failed = False

    # ------------------ Gorev Sarmalayicisi ------------------
    def begin_task(self, name: str, quiet: bool = False, notify: bool = True) -> bool:
        """Isi 'calisiyor' olarak isaretler. ESZAMANLI cagrilir (tusa basildigi anda), boylece hemen ardindan gelen
        Esc / x isi kesin gorur. True donerse ardindan execute_task MUTLAKA cagrilmalidir (kilidi o birakir)."""
        if not self._task_lock.acquire(blocking=False):
            if not quiet:
                self.log(
                    f"[bold yellow]⚠️  {tg('MESGUL')} '{self.active_task_name}' su an calisiyor. "
                    "Durdurmak icin 'x' veya 'Esc'.[/bold yellow]"
                )
            return False
        self.cancel_event.clear()
        self._hold_result = False
        self.active_task_name = name
        self.task_started = time.time()
        self.is_task_running = True
        if notify:
            self.notify_started()
        return True

    def notify_started(self) -> None:
        name = self.active_task_name
        self.prog(f"CALISIYOR: {name}", None, f"{name} baslatildi...")

    def execute_task(self, fn, has_pending=None) -> None:
        """begin_task ile isaretlenen isi calistirir (is thread'inde). Mesgul bayragi sadece is gercekten bitince iner."""
        name = self.active_task_name
        try:
            fn()
        except Exception as e:
            self.log(f"[red]❌ {tg(name)} Beklenmeyen hata: {escape(str(e))}[/red]")
            self.prog("HATA", 0.0, str(e))
            self._hold_result = True
        finally:
            # Iptal edildiyse geride surec kalmasin (abort_active_task oldurememis olabilir).
            self._kill_tree(self.active_subprocess)
            self.active_subprocess = None
            if self.cancel_event.is_set():
                self.prog("IPTAL EDILDI", 0.0, f"'{name}' sonlandirildi.")
                self.log(f"[bold yellow]⏹️  {tg('ABORT')} '{name}' durduruldu.[/bold yellow]")
                self._hold_result = True
            hold = self._hold_result
            self.is_task_running = False
            self.active_task_name = ""
            self._task_lock.release()
        # Sonuc (TAMAMLANDI / HATA / IPTAL) kisa sure ekranda kalir; bu arada yeni is baslayabilir.
        if has_pending and has_pending():
            return  # siradaki is hemen baslayacak: sonuc bekleme ve IDLE atlanir
        if hold:
            time.sleep(1.5)
        if not self.is_task_running:
            self.prog("IDLE", 0.0, "Sistem hazir.")

    def run_task(self, name: str, fn) -> bool:
        if not self.begin_task(name):
            return False
        self.execute_task(fn)
        return True

    def _kill_tree(self, proc: Optional[subprocess.Popen]) -> None:
        """Sureci ve tum alt sureclerini oldurur. Once taskkill, kalan olursa psutil ile tek tek."""
        if not proc or proc.poll() is not None:
            return
        try:
            subprocess.run(["taskkill", "/F", "/T", "/PID", str(proc.pid)], capture_output=True, timeout=5)
        except Exception:
            pass
        if proc.poll() is None:
            try:
                parent = psutil.Process(proc.pid)
                for child in parent.children(recursive=True) + [parent]:
                    try:
                        child.kill()
                    except Exception:
                        pass
            except Exception:
                pass

    def abort_active_task(self) -> bool:
        """Iptal istegi: bayragi kurar ve calisan alt surecin agacini oldurur. Tekrar cagrilmasi zararsizdir.
        Mesgul bayragini is thread'i indirir (is gercekten durunca)."""
        if not self.is_task_running:
            return False
        first = not self.cancel_event.is_set()
        self.cancel_event.set()
        name = self.active_task_name
        if first:
            self.prog("IPTAL EDILIYOR", None, f"'{name}' durduruluyor...")
        proc = self.active_subprocess
        if proc and proc.poll() is None:
            if first:
                self.log(f"[bold red]🛑 {tg('ABORT')} '{name}' sonlandiriliyor (PID: {proc.pid})...[/bold red]")
            self._kill_tree(proc)
        return True

    @property
    def cancelled(self) -> bool:
        return self.cancel_event.is_set()

    # ------------------ Yardimcilar ------------------
    @staticmethod
    def _to_int(value: Optional[str], default: int) -> int:
        try:
            return int(str(value).strip())
        except (TypeError, ValueError):
            return default

    @staticmethod
    def _read_env(path: str) -> dict:
        values: dict = {}
        try:
            if os.path.exists(path):
                with open(path, "r", encoding="utf-8-sig") as f:
                    for line in f:
                        line = line.strip()
                        if not line or line.startswith("#") or "=" not in line:
                            continue
                        k, v = line.split("=", 1)
                        values[k.strip()] = v.strip()
        except Exception:
            pass
        return values

    def _read_project_info(self) -> tuple[str, str]:
        """Proje adi ve surumu: kok package.json'dan; yoksa klasor adi."""
        name, version = os.path.basename(self.root_dir), ""
        try:
            with open(os.path.join(self.root_dir, "package.json"), encoding="utf-8-sig") as f:
                pkg = json.load(f)
            name = str(pkg.get("name") or name)
            version = str(pkg.get("version") or "")
        except Exception:
            pass
        # Konsol pencere basliginda (cmd `title`) sorun cikarmasin
        return re.sub(r"[^A-Za-z0-9_.-]+", "-", name).strip("-").upper() or "PROJE", version

    def git_branch(self) -> str:
        try:
            with open(os.path.join(self.root_dir, ".git", "HEAD"), encoding="utf-8") as f:
                head = f.read().strip()
            return head.rsplit("/", 1)[-1] if head.startswith("ref:") else head[:8]
        except Exception:
            return "-"

    def detect_node(self) -> None:
        try:
            self.node_version = subprocess.check_output("node -v", shell=True, text=True, stderr=subprocess.DEVNULL, timeout=15).strip()
        except Exception:
            self.node_version = ""

    def _mssql_candidates(self) -> list[tuple[str, str]]:
        """MSSQL hedefinin okunabilecegi dosyalar, oncelik sirasiyla: (yol, tur)."""
        esync_home = os.environ.get("ESYNC_HOME") or os.path.join(os.environ.get("APPDATA", ""), "ESync")
        return [
            (os.path.join(self.root_dir, "proman.json"), "proman.json"),
            (os.path.join(esync_home, "config.json"), "ESync config.json"),
            (os.path.join(self.agent_dir, ".env"), "agent/.env"),
        ]

    def _load_mssql_target(self) -> None:
        """MSSQL sunucu / instance / port bilgisini bulur. Hicbir kaynakta yoksa hedef bos kalir ve yoklama yapilmaz
        (varsayilan adrese bakip yaniltici 'ONLINE' gostermemek icin). Dosyalar degismediyse yeniden okumaz."""
        candidates = self._mssql_candidates()
        sig = tuple(os.path.getmtime(path) if os.path.exists(path) else None for path, _ in candidates)
        if sig == self._mssql_sig:
            return
        self._mssql_sig = sig
        host, instance, port, db, source = "", "", DEFAULT_MSSQL_PORT, "", ""
        for path, kind in candidates:
            if not os.path.exists(path):
                continue
            try:
                if kind == "agent/.env":
                    env = self._read_env(path)
                    raw = env.get("MSSQL_HOST", "").strip()
                    cfg = {
                        "server": raw.split("\\", 1)[0],
                        "instance": raw.split("\\", 1)[1] if "\\" in raw else "",
                        "port": env.get("MSSQL_PORT"),
                        "database": env.get("MSSQL_DATABASE", ""),
                    }
                else:
                    with open(path, encoding="utf-8-sig") as f:
                        data = json.load(f)
                    cfg = data.get("mssql") if kind == "proman.json" else data.get("erp")
                if not isinstance(cfg, dict) or not str(cfg.get("server") or "").strip():
                    continue
                host = str(cfg["server"]).strip()
                instance = str(cfg.get("instance") or "").strip()
                port = self._to_int(cfg.get("port"), DEFAULT_MSSQL_PORT)
                db = str(cfg.get("database") or "").strip()
                source = kind
                break
            except Exception:
                continue
        self.mssql_host, self.mssql_instance_name, self.mssql_port, self.mssql_db, self.mssql_source = host, instance, port, db, source

    def write_disk_log(self, plain_message: str) -> None:
        """Satiri log/process_manager_YYYYMMDD.log dosyasina ekler. Klasor yoksa olusturulur; dosya adi her
        yazmada o gunun tarihinden uretilir (gece yarisindan sonra yeni dosya).
        Klasor acilamaz ya da dosyaya yazilamazsa program durmaz: hata ekrana BIR kez yazilir, ekran logu devam
        eder. Yazma sonradan duzelirse dosyaya kayit kendiliginden surer ve yeni bir hata yine bildirilir."""
        now = datetime.now()
        try:
            os.makedirs(self.log_dir, exist_ok=True)
            path = os.path.join(self.log_dir, f"process_manager_{now.strftime('%Y%m%d')}.log")
            with open(path, "a", encoding="utf-8") as f:
                f.write(f"[{now.strftime('%Y-%m-%d %H:%M:%S')}] {ANSI_RE.sub('', plain_message)}\n")
            self._disk_log_failed = False
        except Exception as e:
            if self._disk_log_failed:
                return
            # Bayrak once kalkar: asagidaki log cagrisi yine buraya duser ve sessizce doner (sonsuz dongu olmaz).
            self._disk_log_failed = True
            try:
                self.log(
                    f"[bold red]❌ {tg('LOG')} Log dosyasina yazilamiyor, kayit sadece ekranda tutuluyor: "
                    f"{escape(self.log_dir)} ({escape(str(e))})[/bold red]"
                )
            except Exception:
                pass

    # ------------------ Port & Proses ------------------
    def listening_pids(self, ports: list[int]) -> dict[int, list[int]]:
        """Verilen portlari dinleyen PID'ler; tek sistem cagrisiyla (IPv4 + IPv6)."""
        found: dict[int, set[int]] = {p: set() for p in ports}
        try:
            for c in psutil.net_connections(kind="tcp"):
                if c.status == psutil.CONN_LISTEN and c.laddr and c.laddr.port in found and c.pid:
                    found[c.laddr.port].add(c.pid)
        except Exception:
            for p in ports:
                found[p] = set(self._netstat_pids(p))
        return {p: sorted(v) for p, v in found.items()}

    def _netstat_pids(self, port: int) -> list[int]:
        try:
            output = subprocess.check_output(
                f"netstat -ano -p tcp | findstr LISTENING | findstr :{port}",
                shell=True,
                text=True,
                stderr=subprocess.PIPE,
            )
        except Exception:
            return []
        pids: set[int] = set()
        for line in output.splitlines():
            parts = line.split()
            if len(parts) < 5 or not parts[1].endswith(f":{port}"):
                continue
            try:
                pid = int(parts[-1])
                if pid > 0:
                    pids.add(pid)
            except ValueError:
                continue
        return sorted(pids)

    def get_pids_for_port(self, port: int) -> list[int]:
        return self.listening_pids([port])[port]

    def _cpu_mem(self, pid: int) -> Optional[tuple[Optional[float], float]]:
        """PID icin (cpu %, RAM MB). CPU tum cekirdeklere gore normalize; ilk olcumde None (referans alinir)."""
        try:
            p = self._procs.get(pid)
            cpu: Optional[float] = None
            if p is None or not p.is_running():
                p = psutil.Process(pid)
                p.cpu_percent(interval=None)  # ilk olcum referans; deger bir sonraki yenilemede gelir
                self._procs[pid] = p
            else:
                cpu = p.cpu_percent(interval=None) / (psutil.cpu_count() or 1)
            return cpu, p.memory_info().rss / (1024 * 1024)
        except Exception:
            self._procs.pop(pid, None)
            return None

    def get_pid_metrics(self, pids: list[int]) -> tuple[str, str]:
        """Verilen PID'lerin toplam (cpu, ram) metni."""
        cpu_total, mem_total, cpu_known, any_ok = 0.0, 0.0, False, False
        for pid in pids:
            m = self._cpu_mem(pid)
            if m is None:
                continue
            any_ok = True
            mem_total += m[1]
            if m[0] is not None:
                cpu_known = True
                cpu_total += m[0]
        if not any_ok:
            return "-", "-"
        return (f"{cpu_total:.1f}%" if cpu_known else "..."), f"{mem_total:.1f} MB"

    def scan_processes(self) -> tuple[Optional[int], list[int]]:
        """Tek gecis: (ESync PID'i, node.exe PID'leri). WSA / eski emulator sonuclari self.wsa_pid, self.old_emulator_pids."""
        esync: Optional[int] = None
        nodes: list[int] = []
        wsa: Optional[int] = None
        emus: list[int] = []
        for p in psutil.process_iter(["pid", "name"]):
            try:
                name = (p.info["name"] or "").lower()
                if name == "esync.exe":
                    esync = p.info["pid"]
                elif name == "node.exe":
                    nodes.append(p.info["pid"])
                elif name == "vmmemwsa":
                    wsa = p.info["pid"]
                elif name in ("qemu-system-x86_64.exe", "emulator.exe"):
                    emus.append(p.info["pid"])
            except Exception:
                pass
        self.wsa_pid = wsa
        self.old_emulator_pids = emus
        return esync, nodes

    def forget_pids(self, keep: set[int]) -> None:
        for pid in [p for p in self._procs if p not in keep]:
            self._procs.pop(pid, None)

    @staticmethod
    def _process_name(pid: int) -> str:
        try:
            return psutil.Process(pid).name()
        except Exception:
            return "?"

    def get_port_status(self, port: int) -> bool:
        return bool(self.get_pids_for_port(port))

    @staticmethod
    def _tcp_open(host: str, port: int) -> bool:
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                s.settimeout(1.0)
                host_norm = "127.0.0.1" if host.lower() in ("localhost", ".", "(local)") else host
                return s.connect_ex((host_norm, port)) == 0
        except Exception:
            return False

    def is_db_running(self) -> bool:
        return self._tcp_open(self.db_host, self.db_port)

    def _resolve_instance_port(self) -> Optional[int]:
        """Adlandirilmis instance'in TCP portu: SQL Browser'a (UDP 1434) sorulur. Login / sorgu degildir.
        Sonuc 30 sn saklanir. Browser yanit vermezse None."""
        key = f"{self.mssql_host}\\{self.mssql_instance_name}".lower()
        ts, cached_key, cached = self._mssql_inst_port
        if cached_key == key and time.time() - ts < 30:
            return cached
        port: Optional[int] = None
        try:
            host = "127.0.0.1" if self.mssql_host.lower() in ("localhost", ".", "(local)") else self.mssql_host
            with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
                s.settimeout(1.0)
                s.sendto(b"\x04" + self.mssql_instance_name.encode("ascii", "ignore"), (host, 1434))
                data = s.recv(4096)
            m = re.search(r";tcp;(\d+)", data[3:].decode("ascii", "ignore"), re.IGNORECASE)
            if m:
                port = int(m.group(1))
        except Exception:
            port = None
        self._mssql_inst_port = (time.time(), key, port)
        return port

    def mssql_status(self) -> tuple[Optional[bool], str, str]:
        """(durum, port metni, aciklama). durum None = hedef tanimli degil (yoklama yapilmaz).
        Sadece TCP portu yoklanir; login / sorgu yok."""
        self._load_mssql_target()
        if not self.mssql_source:
            return None, "-", "ayar bulunamadi (ESync config / proman.json)"
        target = self.mssql_host + (f"\\{self.mssql_instance_name}" if self.mssql_instance_name else "")
        port, note = self.mssql_port, ""
        if self.mssql_instance_name:
            resolved = self._resolve_instance_port()
            if resolved:
                port = resolved
            else:
                note = "; SQL Browser yanit vermedi, ayardaki port denendi"
        desc = f"{target} / {self.mssql_db or '?'} ({self.mssql_source}{note})"
        return self._tcp_open(self.mssql_host, port), f":{port}", desc

    def is_mssql_running(self) -> bool:
        return bool(self.mssql_status()[0])

    def is_esync_running(self) -> tuple[bool, Optional[int]]:
        pid = self.scan_processes()[0]
        return pid is not None, pid

    def is_running(self, svc: Service) -> bool:
        # "Calisiyor" = port dinleniyor. DB kontrolu sadece baslatma oncesinde yapilir.
        return self.get_port_status(svc.port)

    def kill_pid(self, pid: int) -> bool:
        if pid <= 0:
            return False
        try:
            subprocess.run(
                ["taskkill", "/F", "/T", "/PID", str(pid)],
                check=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
            )
            return True
        except Exception:
            return False

    def kill_process_tree(self, process: Optional[subprocess.Popen], label: str) -> None:
        if not process or process.poll() is not None:
            return
        self.log(f"[yellow]💀 {tg('KILL')} {label} process tree PID {process.pid} sonlandiriliyor.[/yellow]")
        self.kill_pid(process.pid)

    def free_port(self, port: int, label: str) -> None:
        pids = self.get_pids_for_port(port)
        if not pids:
            return
        for pid in pids:
            self.log(f"[yellow]🔒 {tg('PORT')} {label} :{port} dolu -> PID {pid} ({escape(self._process_name(pid))}) kapatiliyor.[/yellow]")
            if not self.kill_pid(pid):
                self.log(f"[red]❌ {tg('KILL')} PID {pid} kapatilamadi.[/red]")
        time.sleep(1)

    def ensure_port_closed(self, port: int, label: str, retries: int = 3) -> bool:
        for _ in range(retries):
            pids = self.get_pids_for_port(port)
            if not pids:
                return True
            for pid in pids:
                self.kill_pid(pid)
            time.sleep(1)
        return not self.get_pids_for_port(port)

    # ------------------ Bagimlilik (npm workspaces: tek kurulum, kokte) ------------------
    def _package_jsons(self) -> list[str]:
        paths = [os.path.join(self.root_dir, "package.json")]
        for group in ("apps", "packages"):
            base = os.path.join(self.root_dir, group)
            if os.path.isdir(base):
                for name in os.listdir(base):
                    p = os.path.join(base, name, "package.json")
                    if os.path.exists(p):
                        paths.append(p)
        return paths

    def needs_install(self) -> tuple[bool, str]:
        node_modules = os.path.join(self.root_dir, "node_modules")
        if not os.path.isdir(node_modules):
            return (True, "node_modules yok")
        try:
            if not os.listdir(node_modules):
                return (True, "node_modules bos")
        except OSError:
            return (True, "node_modules okunamadi")

        marker = os.path.join(node_modules, ".package-lock.json")
        reference = marker if os.path.exists(marker) else node_modules
        try:
            ref_time = os.path.getmtime(reference)
            for pkg in self._package_jsons():
                if os.path.getmtime(pkg) > ref_time:
                    return (True, f"{os.path.relpath(pkg, self.root_dir)} guncellenmis")
        except OSError:
            pass
        return (False, "")

    # ------------------ Servis Islemleri ------------------
    def start_service(self, svc: Service) -> None:
        tag = svc.label
        self.log(f"[cyan]▶️  {tg(tag)} Baslatiliyor... (Port: {svc.port})[/cyan]")
        if svc is self.mobile:
            # Adres Expo baslarken okunur; bilgisayarin ag adresi degistiyse once .env duzeltilir.
            self.sync_mobile_api_url()

        # Eski surec her durumda once kapatilir; yoksa eski kodla ayakta kalir.
        self.kill_process_tree(svc.process, tag)
        self.free_port(svc.port, tag)
        svc.process = None

        if svc.needs_db and not self.is_db_running():
            self.log(f"[bold red]🚨 {tg(tag)} HATA: PostgreSQL ({self.db_host}:{self.db_port}) kapali! Baslatilamaz.[/bold red]")
            return

        if not os.path.isdir(svc.cwd):
            self.log(f"[red]❌ {tg(tag)} Dizin bulunamadi: {escape(svc.cwd)}[/red]")
            return

        try:
            svc.process = subprocess.Popen(
                f"title {self.project_name} {tag} && {svc.cmd}",
                cwd=svc.cwd,
                creationflags=subprocess.CREATE_NEW_CONSOLE,
                shell=True,
            )
            if self.cancel_event.wait(svc.startup_wait):
                self.log(f"[yellow]⚠️  {tg(tag)} Bekleme iptal edildi; acilan konsol calismaya devam ediyor olabilir.[/yellow]")
                return

            if svc.process.poll() is not None:
                self.log(f"[red]🚨 {tg(tag)} HATA: Proses kapandi (kod: {svc.process.returncode}).[/red]")
                return

            if self.is_running(svc):
                self.log(f"[bold green]✅ {tg(tag)} Port :{svc.port} aktif ve dinleniyor.[/bold green]")
            else:
                self.log(f"[yellow]⚠️  {tg(tag)} Proses ayakta fakat :{svc.port} henuz hazir degil.[/yellow]")
        except Exception as e:
            self.log(f"[red]❌ {tg(tag)} Baslatma hatasi: {escape(str(e))}[/red]")

    def stop_service(self, svc: Service) -> None:
        tag = svc.label
        self.log(f"[yellow]⏹️  {tg(tag)} Durduruluyor...[/yellow]")
        try:
            self.kill_process_tree(svc.process, tag)
            self.free_port(svc.port, tag)
            svc.process = None
            if self.ensure_port_closed(svc.port, tag):
                self.log(f"[green]✅ {tg(tag)} Basariyla kapatildi.[/green]")
            else:
                self.log(f"[red]❌ {tg(tag)} Port :{svc.port} kapatilamadi.[/red]")
        except Exception as e:
            self.log(f"[red]❌ {tg(tag)} Durdurma hatasi: {escape(str(e))}[/red]")

    def toggle_service(self, svc: Service) -> None:
        if self.is_running(svc):
            self.stop_service(svc)
        else:
            self.start_service(svc)

    def _step(self, detail: str) -> None:
        self.prog(f"CALISIYOR: {self.active_task_name}", None, detail)

    def start_system(self) -> None:
        self.log(f"[bold cyan]🚀 {tg('SYSTEM')} Sistem Baslatiliyor (API + Web)...[/bold cyan]")
        self._step("API baslatiliyor...")
        self.start_service(self.api)
        if self.cancelled:
            return
        self._step("Web (Vite) baslatiliyor...")
        self.start_service(self.web)
        if not self.cancelled:
            self.log(f"[bold green]✨ {tg('SYSTEM')} API ve Web baslatma tamamlandi.[/bold green]")

    def stop_system(self) -> None:
        self.log(f"[bold yellow]🛑 {tg('SYSTEM')} Tum Sistem Durduruluyor...[/bold yellow]")
        for svc, detail in ((self.mobile, "Mobil kapatiliyor..."), (self.web, "Web kapatiliyor..."), (self.api, "API kapatiliyor...")):
            if self.cancelled:
                return
            self._step(detail)
            self.stop_service(svc)
        self.log(f"[bold green]✨ {tg('SYSTEM')} Tum servisler durduruldu.[/bold green]")

    def _start_mobile_with(self, cmd: str) -> None:
        original = self.mobile.cmd
        self.mobile.cmd = cmd
        try:
            self.start_service(self.mobile)
        finally:
            self.mobile.cmd = original

    def start_mobile_clean(self) -> None:
        """Mobil'i (Expo) onbellegi temizleyerek baslatir: eski derlenmis dosyalar atilir, hepsi bastan paketlenir."""
        self.stop_service(self.mobile)
        if self.cancelled:
            return
        self._start_mobile_with(f"npx expo start --clear --port {EXPO_PORT}")
        self.log(f"[cyan]ℹ️  {tg('MOBIL')} Onbellek temizlendi; ilk acilis birkac dakika surebilir.[/cyan]")

    def run_esync(self) -> None:
        """ESync'in son halini calistirir: acik olan kapatilir (EXE kilitli kalmasin), derlenir, baslatilir."""
        exe = os.path.join(self.agent_dir, "target", "release", "ESync.exe")
        self.log(f"[cyan]🔁 {tg('ESYNC')} Acik ESync prosesi kapatiliyor (varsa)...[/cyan]")
        subprocess.run(["taskkill", "/IM", "ESync.exe", "/F"], capture_output=True, text=True)
        time.sleep(1)
        self.log(f"[cyan]🔨 {tg('ESYNC')} Cargo release derlemesi basliyor (ilk seferde birkac dakika surebilir)...[/cyan]")

        if not self._stream("cargo build --release", self.agent_dir, "ESYNC", count_word="Compiling"):
            self.log(f"[red]❌ {tg('ESYNC')} Derleme basarisiz veya durduruldu; ESync baslatilmadi.[/red]")
            return
        if not os.path.exists(exe):
            self.log(f"[red]❌ {tg('ESYNC')} Exe bulunamadi: {escape(exe)}[/red]")
            return
        # Ayri surec: PROMAN kapansa da ESync tepside calismaya devam eder.
        subprocess.Popen(
            [exe],
            cwd=self.agent_dir,
            creationflags=getattr(subprocess, "DETACHED_PROCESS", 0) | getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0),
            close_fds=True,
        )
        self.log(f"[bold green]✅ {tg('ESYNC')} Baslatildi (Tray simgesinde aktif).[/bold green]")

    # ------------------ Tablet / Android ------------------
    def _run_quiet(self, args: list[str], timeout: int = 15) -> str:
        try:
            return subprocess.run(args, capture_output=True, text=True, timeout=timeout).stdout.strip()
        except Exception:
            return ""

    def android_devices(self) -> list[str]:
        """Bagli ve hazir cihazlar (emulator veya USB)."""
        lines = self._run_quiet([self.adb, "devices"]).splitlines()[1:]
        return [line.split()[0] for line in lines if line.strip().endswith("device")]

    def _android_alive(self, device: str) -> bool:
        """Cihazda Android gercekten calisiyor mu: paket yoneticisi yanit veriyorsa evet."""
        return self._run_quiet([self.adb, "-s", device, "shell", "pm", "path", "android"]).startswith("package:")

    def _adb_devices(self) -> list[tuple[str, str]]:
        """Bagli ve hazir cihazlar: (seri no, model). Emulatorler de listelenir."""
        out = []
        for line in self._run_quiet([self.adb, "devices", "-l"]).splitlines()[1:]:
            parts = line.split()
            if len(parts) >= 2 and parts[1] == "device":
                model = next((p.split(":", 1)[1] for p in parts if p.startswith("model:")), "?")
                out.append((parts[0], model.replace("_", " ")))
        return out

    def get_lan_ip(self) -> str:
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
                s.connect(("8.8.8.8", 80))
                return s.getsockname()[0]
        except OSError:
            return "127.0.0.1"

    def expo_url(self) -> str:
        """Expo Go'nun QR ile actigi adres (Expo konsolundaki 'Metro: exp://...' satiri)."""
        return f"exp://{self.get_lan_ip()}:{EXPO_PORT}"

    def lan_url(self) -> str:
        return f"http://{self.get_lan_ip()}:{self.api_port}"

    def _mobile_env_lines(self) -> list[str]:
        if not os.path.exists(self.mobile_env):
            return []
        with open(self.mobile_env, "r", encoding="utf-8-sig") as f:
            return f.read().splitlines()

    def is_mobile_api_url_manual(self) -> bool:
        """Adres elle mi yazildi: .env'deki isaret satiri varsa otomatik ag adresi devre disidir."""
        return any(line.strip() == MANUAL_URL_MARK for line in self._mobile_env_lines())

    def set_mobile_api_url(self, url: str, manual: bool = False) -> None:
        """apps/mobile/.env icindeki EXPO_PUBLIC_API_URL satirini yazar; diger satirlara dokunmaz.
        manual=True ise isaret satiri eklenir ve adres bundan sonra kendiliginden degistirilmez."""
        lines = [line for line in self._mobile_env_lines() if line.strip() != MANUAL_URL_MARK]
        if manual:
            lines.insert(0, MANUAL_URL_MARK)
        found = False
        for i, line in enumerate(lines):
            if line.strip().startswith("EXPO_PUBLIC_API_URL="):
                lines[i] = f"EXPO_PUBLIC_API_URL={url}"
                found = True
        if not found:
            lines.append(f"EXPO_PUBLIC_API_URL={url}")
        with open(self.mobile_env, "w", encoding="utf-8", newline="\n") as f:
            f.write("\n".join(lines) + "\n")
        self.log(f"[green]📝 {tg('TABLET')} apps/mobile/.env -> EXPO_PUBLIC_API_URL = {escape(url)}[/green]")

    def get_current_mobile_api_url(self) -> str:
        return self._read_env(self.mobile_env).get("EXPO_PUBLIC_API_URL", "(yok)")

    def sync_mobile_api_url(self) -> None:
        """Otomatik modda .env'deki adresi bilgisayarin su anki ag adresine esitler. Emulator de gercek cihaz da
        ag adresiyle baglanir; 10.0.2.2 kullanilmaz (gercek cihazda calismaz). Elle yazilan adrese dokunulmaz."""
        current = self.get_current_mobile_api_url()
        if self.is_mobile_api_url_manual():
            self.log(f"[cyan]ℹ️  {tg('TABLET')} Sunucu adresi elle secilmis, degistirilmedi: {escape(current)}[/cyan]")
            return
        if self.get_lan_ip() == "127.0.0.1":
            self.log(f"[yellow]⚠️  {tg('TABLET')} Ag adresi bulunamadi (ag bagli degil?); sunucu adresi degistirilmedi: {escape(current)}[/yellow]")
            return
        target = self.lan_url()
        if current != target:
            self.log(f"[yellow]🔁 {tg('TABLET')} Sunucu adresi ag adresine esitleniyor: {escape(current)} -> {escape(target)}[/yellow]")
            self.set_mobile_api_url(target)

    # ------------------ WSA (Android alt sistemi) ------------------
    def wsa_status(self) -> tuple[str, str]:
        """WSA / Android'in KESIN durumu. (kod, renkli etiket) doner. Once scan_processes calismis olmali.
        Katmanlar: vmmemWSA sureci -> ADB cihazi -> Android'in gercekten yanit vermesi (pm path android).
        Kodlar: off, noadb, unauth, dead, alive."""
        if not self.wsa_pid:
            return "off", "[dim]○ KAPALI[/dim]"
        state = ""
        for _ in range(2):
            for line in self._run_quiet([self.adb, "devices"], timeout=5).splitlines()[1:]:
                parts = line.split()
                if len(parts) >= 2 and parts[0] == WSA_ADB:
                    state = parts[1]
            if state:
                break
            # WSA PROMAN disinda acilmis olabilir: ADB baglantisi yoksa bir kez baglanmayi dene (yerel, zararsiz)
            self._run_quiet([self.adb, "connect", WSA_ADB], timeout=5)
        if state == "unauthorized":
            return "unauth", "[bold yellow]◐ ADB IZNI BEKLIYOR[/bold yellow]"
        if state != "device":
            return "noadb", "[bold yellow]◐ WSA ACIK, ADB YOK[/bold yellow]"
        if not self._android_alive(WSA_ADB):
            return "dead", "[bold yellow]◐ ANDROID YANITSIZ[/bold yellow]"
        return "alive", "[bold green]● ANDROID CALISIYOR[/bold green]"

    WSA_AUTO_BASE = (r"Software\Classes\Local Settings\Software\Microsoft\Windows\CurrentVersion\AppModel\SystemAppData"
                     r"\MicrosoftCorporationII.WindowsSubsystemForAndroid_8wekyb3d8bbwe")
    # WSA'nin iki baslangic gorevi: ad -> gorunen ad. State: 0 kapali, 1 kullanici kapatti, 2 acik, 3/4 ilke ile
    WSA_AUTO_TASKS = {"ContinuousVirtualMachine": "surekli", "PartiallyRunningVirtualMachine": "kismi"}

    def wsa_autostart_states(self) -> Optional[dict[str, Optional[int]]]:
        """Gorev adi -> State (kayit yoksa None). Kayit defteri okunamazsa tum sonuc None."""
        try:
            import winreg
            out: dict[str, Optional[int]] = {}
            for task in self.WSA_AUTO_TASKS:
                try:
                    with winreg.OpenKey(winreg.HKEY_CURRENT_USER, f"{self.WSA_AUTO_BASE}\\{task}") as key:
                        out[task] = winreg.QueryValueEx(key, "State")[0]
                except FileNotFoundError:
                    out[task] = None  # kayit yok: kullanici hic acmamis, varsayilan kapali
            return out
        except Exception:
            return None

    def wsa_autostart(self) -> tuple[str, str]:
        """WSA'nin kendisi (Android OS degil) Windows oturum acilisinda otomatik baslayacak mi. Salt okunur.
        Kod: on, off, unknown. Etiket tabloda 'WSA - Auto' satirinin durum hucresine yazilir."""
        states = self.wsa_autostart_states()
        if states is None:
            return "unknown", "[dim]? OKUNAMADI[/dim]"
        on = [self.WSA_AUTO_TASKS[t] for t, s in states.items() if s in (2, 4)]
        if on:
            return "on", f"[bold #c084fc]● ENABLE ({'+'.join(on)})[/bold #c084fc]"
        return "off", "[bold yellow]○ DISABLE[/bold yellow]"

    def wsa_autostart_info(self) -> None:
        """Menu: oto-baslangic durumunu ayrintili loga yazar."""
        tag = tg("TABLET")
        states = self.wsa_autostart_states()
        if states is None:
            self.log(f"[red]❌ {tag} WSA oto-baslangic: kayit defteri okunamadi.[/red]")
            return
        names = {0: "kapali", 1: "kullanici kapatti", 2: "ACIK", 3: "ilke ile kapali", 4: "ilke ile ACIK", None: "kayit yok (kapali)"}
        for task, label in self.WSA_AUTO_TASKS.items():
            self.log(f"[cyan]ℹ️  {tag} WSA oto-baslangic ({label}) {task}: {names.get(states[task], states[task])}[/cyan]")
        code, label = self.wsa_autostart()
        self.log(f"{tag} WSA oto-baslangic sonuc: {label}")
        self.log(f"[cyan]ℹ️  {tag} WSA servisi (WsaService) baslatma turu: Manual; gorev acikken oturum acilisinda tetiklenir (tetiklendigi dogrulanmadi).[/cyan]")

    def wsa_autostart_set(self, enable: bool) -> None:
        """Menu: oto-baslangici acar (kismi gorev) veya kapatir (iki gorev). Windows'un kendi baslangic ayarini
        (HKCU, Ayarlar > Uygulamalar > Baslangic ile ayni kayit) degistirir; WSA'nin calisan halini etkilemez."""
        tag = tg("TABLET")
        try:
            import winreg
            # Acarken sadece "kismi" gorev (WSA'nin 'As needed' modu); kapatirken ikisi de
            for task in (["PartiallyRunningVirtualMachine"] if enable else list(self.WSA_AUTO_TASKS)):
                path = f"{self.WSA_AUTO_BASE}\\{task}"
                current = (self.wsa_autostart_states() or {}).get(task)
                if current in (3, 4):
                    self.log(f"[yellow]⚠️  {tag} {task} ilke ile yonetiliyor, degistirilemez.[/yellow]")
                    continue
                if not enable and current not in (2, 4):
                    continue  # zaten kapali (kayit yok veya State 0/1); degere dokunulmaz
                with winreg.CreateKey(winreg.HKEY_CURRENT_USER, path) as key:
                    winreg.SetValueEx(key, "State", 0, winreg.REG_DWORD, 2 if enable else 1)
                    if enable:
                        winreg.SetValueEx(key, "UserEnabledStartupOnce", 0, winreg.REG_DWORD, 1)
        except Exception as exc:
            self.log(f"[red]❌ {tag} WSA oto-baslangic degistirilemedi: {escape(str(exc))}[/red]")
            return
        code, label = self.wsa_autostart()
        ok = (code == "on") == enable and code != "unknown"
        verb = "acildi" if enable else "kapatildi"
        if ok:
            self.log(f"[bold green]✅ {tag} WSA oto-baslangic {verb}: {label}[/bold green]")
            self.log(f"[cyan]ℹ️  {tag} Etkisi bir sonraki oturum acilisinda gorulur; calisan WSA'ya dokunulmadi.[/cyan]")
        else:
            self.log(f"[red]❌ {tag} Degisiklik dogrulanamadi, durum: {label}[/red]")
    def _firewall_allows(self, port: int) -> Optional[bool]:
        """Gelen kural listesinde port icin izin var mi (salt okunur). Okunamazsa None."""
        try:
            raw = subprocess.run(
                ["netsh", "advfirewall", "firewall", "show", "rule", "name=all", "dir=in"],
                capture_output=True, timeout=20,
            ).stdout.decode("mbcs", errors="replace")
        except Exception:
            return None
        if "LocalPort" not in raw:
            return None
        for block in raw.split("Rule Name:"):
            low = block.lower()
            if "enabled:" in low and "yes" not in low.split("enabled:", 1)[1].split("\n", 1)[0]:
                continue
            if "action:" in low and "allow" not in low.split("action:", 1)[1].split("\n", 1)[0]:
                continue
            ports = low.split("localport:", 1)[1].split("\n", 1)[0] if "localport:" in low else ""
            for item in ports.replace(" ", "").strip().split(","):
                lo, _, hi = item.partition("-")
                if lo.isdigit() and int(lo) <= port <= int(hi or lo):
                    return True
            if "node.exe" in low:
                return True
        return False

    def wsa_preflight(self) -> bool:
        """Tablet oncesi hazirlik: WSA kurulu mu, eski emulator, adb sunucusu, firewall. Hata varsa False."""
        tag = tg("TABLET")
        ok = True
        if not os.path.exists(WSA_CLIENT):
            self.log(f"[red]❌ {tag} Hazirlik: WSA bulunamadi: {escape(WSA_DIR)}[/red]")
            return False
        self.log(f"[green]✅ {tag} Hazirlik: WSA kurulu ({escape(WSA_DIR)})[/green]")
        if not os.path.exists(self.adb):
            self.log(f"[red]❌ {tag} Hazirlik: adb bulunamadi: {escape(self.adb)}[/red]")
            return False
        self._run_quiet([self.adb, "start-server"], timeout=20)
        self.log(f"[green]✅ {tag} Hazirlik: adb sunucusu hazir[/green]")

        # Eski Android Studio emulatoru: ikinci cihaz olusturur, RAM yer, Expo yanlis cihaza baglanabilir
        self.scan_processes()
        if self.old_emulator_pids:
            self.log(f"[yellow]⚠️  {tag} Hazirlik: eski emulator acik, kapatiliyor...[/yellow]")
            for device in [d for d in self.android_devices() if d.startswith("emulator-")]:
                self._run_quiet([self.adb, "-s", device, "emu", "kill"])
            time.sleep(3)
            self._run_quiet(["taskkill", "/F", "/IM", "qemu-system-x86_64.exe", "/T"])
            self._run_quiet(["taskkill", "/F", "/IM", "emulator.exe", "/T"])
            self.log(f"[green]✅ {tag} Hazirlik: eski emulator kapatildi[/green]")

        # Firewall: ayni agdaki cihaz/WSA API ve Metro'ya baglanabilmeli (salt okunur kontrol, uyari)
        for label, port in (("API", self.api_port), ("Metro", EXPO_PORT)):
            allowed = self._firewall_allows(port)
            if allowed is None:
                self.log(f"[cyan]ℹ️  {tag} Hazirlik: Firewall kontrol edilemedi ({label} :{port})[/cyan]")
            elif not allowed:
                ok_cmd = f'netsh advfirewall firewall add rule name="catApp {label}" dir=in action=allow protocol=TCP localport={port}'
                self.log(f"[yellow]⚠️  {tag} Hazirlik: Firewall'da {label} :{port} icin izin yok. Gerekirse yonetici olarak: {escape(ok_cmd)}[/yellow]")
            else:
                self.log(f"[green]✅ {tag} Hazirlik: Firewall {label} :{port} izinli[/green]")
        return ok

    def start_wsa(self) -> bool:
        """WSA'yi acar, ADB'yi baglar ve Android'in gercekten yanit vermesini bekler. Zaten hazirsa dokunmaz."""
        tag = tg("TABLET")
        if not self.wsa_preflight() or self.cancelled:
            return False
        self.scan_processes()
        if self.wsa_status()[0] == "alive":
            self.log(f"[green]✅ {tag} Android (WSA) zaten calisiyor: {WSA_ADB}[/green]")
            return True
        if not self.wsa_pid:
            self.log(f"[cyan]▶️  {tag} WSA baslatiliyor...[/cyan]")
            try:
                os.startfile(WSA_START_URI)  # WsaClient.exe dogrudan calistirilinca baslamaz; protokol gerekir
            except OSError as exc:
                self.log(f"[red]❌ {tag} WSA baslatilamadi: {escape(str(exc))}[/red]")
                return False
        self.log(f"[cyan]⏳ {tag} Android'in acilmasi bekleniyor...[/cyan]")
        deadline = time.time() + 150
        hinted = False
        while time.time() < deadline:
            self.scan_processes()
            code = self.wsa_status()[0]
            if code == "alive":
                self.log(f"[bold green]✅ {tag} Android (WSA) hazir: {WSA_ADB}[/bold green]")
                return True
            if code == "unauth" and not hinted:
                hinted = True
                self.log(f"[bold yellow]⚠️  {tag} WSA penceresinde 'Allow USB debugging?' kutusuna 'Always allow' isaretleyip Allow'a basin.[/bold yellow]")
            if code == "noadb" and not hinted and time.time() > deadline - 100:
                hinted = True
                self.log(f"[yellow]⚠️  {tag} ADB baglanmiyor: WSA Settings > Advanced settings > Developer mode acik olmali.[/yellow]")
            if self.cancel_event.wait(3):
                self.log(f"[yellow]⚠️  {tag} WSA bekleme iptal edildi.[/yellow]")
                return False
        if not self.wsa_pid:
            self.log(f"[red]❌ {tag} WSA acilmadi. Sanal Makine Platformu / Hyper-V kapali olabilir (Windows Ozellikleri).[/red]")
        else:
            self.log(f"[yellow]⚠️  {tag} Android 150 sn icinde hazir olmadi; gostergedeki durumu kontrol edin.[/yellow]")
        return False

    def stop_wsa(self) -> None:
        """Android alt sistemini kapatir (RAM serbest kalir). WsaClient.exe /shutdown dogrudan calismaz; servis durdurulur."""
        tag = tg("TABLET")
        self.scan_processes()
        if not self.wsa_pid:
            self.log(f"[cyan]ℹ️  {tag} WSA zaten kapali.[/cyan]")
            return
        self._run_quiet([self.adb, "disconnect", WSA_ADB], timeout=5)
        try:
            res = subprocess.run(["net", "stop", "WsaService"], capture_output=True, timeout=60)
            if res.returncode != 0:
                self.log(f"[yellow]ℹ️  {tag} Servis durdurulamadi (yonetici gerekebilir): {escape(res.stdout.decode('mbcs', errors='replace').strip()[-120:])}[/yellow]")
        except Exception as exc:
            self.log(f"[red]❌ {tag} WSA kapatilamadi: {escape(str(exc))}[/red]")
            return
        deadline = time.time() + 20
        while time.time() < deadline:
            self.scan_processes()
            if not self.wsa_pid:
                self.log(f"[green]⏹️  {tag} WSA kapatildi (vmmemWSA yok).[/green]")
                return
            time.sleep(1)
        self.log(f"[red]❌ {tag} WSA hala calisiyor. WSA Settings > System > Turn off ile kapatin.[/red]")

    def start_tablet_all(self) -> None:
        """Tek tus: API + WSA (Android) + adres ayari + uygulamanin WSA'da acilmasi."""
        self.log(f"[bold cyan]📱 {tg('TABLET')} Tablet uygulamasi baslatiliyor...[/bold cyan]")
        if not self.is_running(self.api):
            self._step("API baslatiliyor...")
            self.start_service(self.api)
        if self.cancelled:
            return
        self._step("WSA / Android bekleniyor...")
        if not self.start_wsa() or self.cancelled:
            return
        # --android: Expo, uygulamayi bagli cihazda kendisi acar (gerekirse Expo Go'yu kurar).
        self._step("Expo (android) baslatiliyor...")
        self._start_mobile_with(f"npx expo start --android --port {EXPO_PORT}")
        self.log(f"[cyan]ℹ️  {tg('TABLET')} Uygulama cihazda acilmazsa MOBIL konsolunda 'a' tusuna basin.[/cyan]")
        self.log(f"[cyan]ℹ️  {tg('TABLET')} Icerik gormek icin panelde Manager'dan bir katalog yayinda olmali.[/cyan]")

    def start_tablet_app(self) -> None:
        """Sadece tabletteki (WSA) Expo Go: aciksa kapatir, yeniden acar; ana ekraninda kalir (proje oradan elle baslatilir).
        API, WSA ve Metro'ya (MOBIL) dokunmaz."""
        tag = tg("TABLET")
        self.scan_processes()
        if self.wsa_status()[0] != "alive":
            self.log(f"[red]❌ {tag} Android (WSA) calismiyor; once WSA'yi acin.[/red]")
            return
        self.log(f"[cyan]🔁 {tag} Expo Go kapatilip yeniden aciliyor...[/cyan]")
        self._run_quiet([self.adb, "-s", WSA_ADB, "shell", "am", "force-stop", EXPO_GO_PACKAGE], timeout=10)
        out = self._run_quiet([self.adb, "-s", WSA_ADB, "shell", "monkey", "-p", EXPO_GO_PACKAGE,
                               "-c", "android.intent.category.LAUNCHER", "1"])
        if "Events injected: 1" not in out:
            self.log(f"[red]❌ {tag} Expo Go acilamadi (kurulu mu?): {escape(out[-160:])}[/red]")
            return
        self.log(f"[bold green]✅ {tag} Expo Go acildi.[/bold green]")

    # ------------------ Mobil Derleme (cihaza gercek uygulama olarak kurma) ------------------
    def _pick_device(self) -> Optional[str]:
        """Derlemenin kurulacagi cihaz. Tek cihaz varsa sormaz."""
        devices = self._adb_devices()
        if not devices:
            self.log(f"[red]❌ {tg('DERLEME')} Bagli cihaz yok. Telefonda 'USB hata ayiklama' acik olmali ve bilgisayara izin verilmeli.[/red]")
            return None
        if len(devices) == 1:
            self.log(f"[cyan]📱 {tg('DERLEME')} Cihaz: {escape(devices[0][1])} ({devices[0][0]})[/cyan]")
            return devices[0][0]
        options = [
            (serial, f"{model}  ({'emulator' if serial.startswith('emulator-') else 'WSA' if serial == WSA_ADB else 'USB cihaz'}, {serial})")
            for serial, model in devices
        ]
        return self.pick("📱 Hangi cihaza kurulsun?", options)

    def _android_prebuild(self) -> bool:
        """Yerel Android projesini (apps/mobile/android) uygulama ayarlarindan uretir / gunceller."""
        os.environ.setdefault("ANDROID_HOME", self.android_sdk)
        # Derleme Java 17 ile yapilir. Android Studio'nun kendi Java'si (25) yerel kod (CMake) adimini bozuyor:
        # "A restricted method in java.lang.System has been called" uyarisi hata sayiliyor. Gradle'in indirdigi
        # Java 17 varsa o kullanilir; yoksa mevcut JAVA_HOME ile denenir.
        jdk17 = os.path.join(os.path.expanduser("~"), ".gradle", "jdks")
        candidates = sorted(
            d
            for d in (os.listdir(jdk17) if os.path.isdir(jdk17) else [])
            if "-17-" in d and os.path.exists(os.path.join(jdk17, d, "bin", "java.exe"))
        )
        if candidates:
            os.environ["JAVA_HOME"] = os.path.join(jdk17, candidates[-1])
        elif not os.environ.get("JAVA_HOME"):
            self.log(f"[red]❌ {tg('DERLEME')} Java bulunamadi (JAVA_HOME tanimli degil).[/red]")
            return False
        self.log(f"[cyan]☕ {tg('DERLEME')} Java: {escape(os.environ['JAVA_HOME'])}[/cyan]")
        # Proje zaten uretilmisse ve uygulama ayari (app.json) o zamandan beri degismediyse yeniden uretilmez:
        # yeniden uretim klasoru silip bastan kurar; derleme aciksa "klasor kullanimda" hatasi verir ve bosuna zaman alir.
        android_dir = os.path.join(self.mobile_dir, "android")
        stamp = os.path.join(android_dir, ".prebuild-stamp")
        app_json = os.path.join(self.mobile_dir, "app.json")
        if (
            os.path.exists(os.path.join(android_dir, "gradlew.bat"))
            and os.path.exists(stamp)
            and os.path.getmtime(stamp) >= os.path.getmtime(app_json)
        ):
            self.log(f"[cyan]🧱 {tg('DERLEME')} Yerel Android projesi hazir (uygulama ayari degismemis).[/cyan]")
            return True
        self.log(f"[cyan]🧱 {tg('DERLEME')} Yerel Android projesi hazirlaniyor (expo prebuild)...[/cyan]")
        if not self._stream("npx expo prebuild --platform android --no-install", self.mobile_dir, "DERLEME"):
            if not self.cancelled:
                self.log(f"[yellow]ℹ️  {tg('DERLEME')} 'resource busy' hatasi: baska bir derleme veya Android Studio klasoru kullaniyor olabilir; bitmesini bekleyin.[/yellow]")
            return False
        with open(stamp, "w", encoding="utf-8") as f:
            f.write("prebuild")
        return True

    def _shorten_native_build_path(self) -> bool:
        """Windows'ta yerel kod (CMake / ninja) ara dosyalarinin yolu 260 karakteri asinca derleme
        'ninja: error: mkdir(...): No such file or directory' ile durur (Release'te klasor adi RelWithDebInfo oldugu icin
        Debug'a gore daha uzun). Ara dosyalar kisa bir klasore (C:/cxx/catapp) alinir. Uretilmis android/app/build.gradle'a
        bir kez eklenir (expo prebuild dosyayi yeniden uretirse tekrar eklenir)."""
        gradle = os.path.join(self.mobile_dir, "android", "app", "build.gradle")
        try:
            with open(gradle, encoding="utf-8") as f:
                text = f.read()
        except OSError:
            self.log(f"[red]❌ {tg('DERLEME')} android/app/build.gradle okunamadi.[/red]")
            return False
        if self.SHORT_PATH_MARK in text:
            return True
        anchor = "    ndkVersion rootProject.ext.ndkVersion\n"
        if anchor not in text:
            self.log(f"[yellow]⚠️  {tg('DERLEME')} build.gradle beklenen bicimde degil; kisa yol ayari eklenemedi (uzun yol hatasi cikabilir).[/yellow]")
            return True
        patch = f"{anchor}    // {self.SHORT_PATH_MARK}: ara dosyalar kisa klasorde (Windows yol siniri)\n    externalNativeBuild {{ cmake {{ buildStagingDirectory = file('C:/cxx/catapp') }} }}\n"
        with open(gradle, "w", encoding="utf-8", newline="\n") as f:
            f.write(text.replace(anchor, patch, 1))
        self.log(f"[cyan]🧱 {tg('DERLEME')} Yerel kod ara dosyalari kisa klasore alindi (C:/cxx/catapp); ilk derleme yerel kodu bastan kurar.[/cyan]")
        return True

    def _gradle(self, task: str, serial: Optional[str]) -> bool:
        android_dir = os.path.join(self.mobile_dir, "android")
        if serial:
            # Gradle kurulumu ve adb, birden fazla cihaz bagliyken bu cihazi hedef alir.
            os.environ["ANDROID_SERIAL"] = serial
        try:
            return self._stream(f"gradlew.bat {task}", android_dir, "DERLEME")
        finally:
            os.environ.pop("ANDROID_SERIAL", None)

    def build_android(self, release: bool) -> None:
        """Debug / Release derler ve secilen cihaza kurar."""
        serial = self._pick_device()
        if not serial or self.cancelled:
            return
        # Sunucu adresi derlemeye gomulur.
        self.sync_mobile_api_url()
        if not self._android_prebuild() or not self._shorten_native_build_path():
            return
        variant = "Release" if release else "Debug"
        self.log(f"[bold cyan]🔨 {tg('DERLEME')} Android {variant} derleniyor ve cihaza kuruluyor (ilk derleme 10-20 dakika surebilir)...[/bold cyan]")
        if not self._gradle(f"app:install{variant}", serial):
            return
        if not release:
            # Debug surumu kodu bilgisayardaki Metro'dan alir: Metro acilir ve cihazin 8081'i bilgisayara yonlendirilir.
            if not self.is_running(self.mobile):
                self.start_service(self.mobile)
            self._run_quiet([self.adb, "-s", serial, "reverse", f"tcp:{EXPO_PORT}", f"tcp:{EXPO_PORT}"])
        self._run_quiet([self.adb, "-s", serial, "shell", "monkey", "-p", ANDROID_PACKAGE, "-c", "android.intent.category.LAUNCHER", "1"])
        if release:
            self.log(f"[bold green]✅ {tg('DERLEME')} Release kuruldu ve acildi. Bilgisayardan bagimsiz calisir; sunucu (API) ve ayni ag gerekli.[/bold green]")
        else:
            self.log(f"[bold green]✅ {tg('DERLEME')} Debug kuruldu ve acildi. Kod degisince kendiliginden yenilenir; MOBIL penceresi acik kalmali.[/bold green]")

    def build_android_apk(self) -> None:
        """Release APK dosyasi uretir (cihaza kurmaz); baska cihazlara elle kurulabilir."""
        self.sync_mobile_api_url()
        self.log(
            f"[cyan]📦 {tg('DERLEME')} APK'ya gomulecek sunucu adresi: {escape(self.get_current_mobile_api_url())} "
            "(yanlissa iptal edip 't' ile degistirin)[/cyan]"
        )
        if not self._android_prebuild() or not self._shorten_native_build_path():
            return
        self.log(f"[bold cyan]🔨 {tg('DERLEME')} Release APK uretiliyor (gradlew app:assembleRelease)...[/bold cyan]")
        if self._gradle("app:assembleRelease", None):
            apk = os.path.join(self.mobile_dir, "android", "app", "build", "outputs", "apk", "release", "app-release.apk")
            self.log(f"[bold green]✅ {tg('DERLEME')} APK Hazir: {escape(apk)}[/bold green]")

    # ------------------ Diger Araclar ------------------
    def run_migrations(self) -> None:
        if not self.is_db_running():
            self.log(f"[red]❌ {tg('DB')} PostgreSQL ({self.db_host}:{self.db_port}) kapali, migration calistirilamaz.[/red]")
            return
        self.log(f"[bold cyan]🗄️  {tg('DB')} npm run db:migrate baslatiliyor...[/bold cyan]")
        self._stream("npm run db:migrate", self.root_dir, "DB")

    def run_npm_install(self) -> None:
        self.log(f"[bold cyan]📦 {tg('NPM')} Kok dizinde npm install baslatiliyor: {escape(self.root_dir)}[/bold cyan]")
        self._stream("npm install", self.root_dir, "NPM")

    def print_system_info(self) -> None:
        self.log(f"[cyan]💻 {tg('INFO')} Sistem bilgileri toplaniyor...[/cyan]")
        checks = [
            ("Node.js ", "node -v"),
            ("NPM     ", "npm -v"),
            ("Rust    ", "rustc --version"),
            ("Cargo   ", "cargo --version"),
            ("Python  ", "python --version"),
        ]
        for label, cmd in checks:
            try:
                out = subprocess.check_output(cmd, shell=True, text=True, stderr=subprocess.STDOUT, timeout=20).strip()
                self.log(f"[green]✅ {label}: {escape(out)}[/green]")
            except Exception:
                self.log(f"[red]❌ {label}: kurulu degil veya PATH'te yok[/red]")
        self.log(f"📁 Proje kok dizini : {escape(self.root_dir)}")
        self.log(f"🐘 Veritabani       : {self.db_host}:{self.db_port}")
        ms_ok, ms_port, ms_desc = self.mssql_status()
        color = "dim" if ms_ok is None else ("green" if ms_ok else "red")
        self.log(f"[{color}]🏭 MSSQL            : {escape(ms_desc)} {ms_port}[/{color}]")
        needed, reason = self.needs_install()
        color = "yellow" if needed else "green"
        self.log(f"[{color}]📦 Bagimliliklar    : {'EKSIK - ' + escape(reason) if needed else 'guncel'}[/{color}]")

    # ------------------ Token Kullanimi (ccusage) ------------------
    TOKEN_FIELDS = ("inputTokens", "outputTokens", "cacheCreationTokens", "cacheReadTokens", "totalTokens")

    @staticmethod
    def _fmt_tokens(n: int) -> str:
        """Token sayisini en fazla 5 karakterle yazar: 950, 12.3K, 481M, 2.92B."""
        for unit, div in (("B", 1e9), ("M", 1e6), ("K", 1e3)):
            if n >= div:
                v = n / div
                return f"{v:.2f}{unit}" if v < 10 else (f"{v:.1f}{unit}" if v < 100 else f"{v:.0f}{unit}")
        return str(int(n))

    def _ccusage_daily(self) -> Optional[dict]:
        """ccusage'dan Claude Code'un proje bazli gunluk dokumunu alir ({proje klasoru: [gun satirlari]}).
        Cikti dosyaya yazilir (boru dolup takilmasin); iptal 0.2 sn icinde gorulur.
        --offline: fiyat tablosu indirilmez; maliyet bilgisi hic kullanilmiyor."""
        cmd = "npx --yes ccusage@latest claude daily --json --instances --offline"
        with tempfile.TemporaryFile() as out, tempfile.TemporaryFile() as err:
            try:
                process = subprocess.Popen(cmd, cwd=self.root_dir, shell=True, stdin=subprocess.DEVNULL, stdout=out, stderr=err)
            except Exception as e:
                self.log(f"[red]❌ {tg('TOKEN')} ccusage baslatilamadi: {escape(str(e))}[/red]")
                return None
            self.active_subprocess = process
            started = time.time()
            while process.poll() is None:
                self.prog("CALISIYOR: TOKEN", None, "ccusage oturum dosyalarini okuyor...", f"{int(time.time() - started)} sn")
                if self.cancel_event.wait(0.2):
                    self._kill_tree(process)
                    self.active_subprocess = None
                    return None
            self.active_subprocess = None
            out.seek(0)
            err.seek(0)
            text = out.read().decode("utf-8", errors="replace")
            if process.returncode != 0:
                tail = (err.read().decode("utf-8", errors="replace").strip() or text.strip())[-300:]
                self.log(f"[red]❌ {tg('TOKEN')} ccusage basarisiz (kod {process.returncode}): {escape(tail)}[/red]")
                return None
        try:
            projects = json.loads(text[text.index("{"):]).get("projects")
        except ValueError:
            projects = None
        if not isinstance(projects, dict):
            self.log(f"[red]❌ {tg('TOKEN')} ccusage ciktisi okunamadi (beklenen: projects).[/red]")
            return None
        return projects

    @staticmethod
    def _downloads_dir() -> str:
        try:
            import winreg
            with winreg.OpenKey(winreg.HKEY_CURRENT_USER, r"Software\Microsoft\Windows\CurrentVersion\Explorer\User Shell Folders") as key:
                return os.path.expandvars(winreg.QueryValueEx(key, "{374DE290-123F-4565-9164-39C4925E467B}")[0])
        except Exception:
            return os.path.join(os.path.expanduser("~"), "Downloads")

    def print_token_usage(self, period: str, to_json: bool = False) -> None:
        """Bu projenin (kok dizin ve alt klasorleri) Claude Code token kullanimi. period: daily / weekly / monthly.
        ccusage gunluk verir; hafta (Pazartesi baslar) ve ay toplamlari burada hesaplanir.
        to_json: tablo yerine tum donemler Downloads klasorune JSON dosyasi olarak yazilir."""
        title, limit = {"daily": ("Gunluk", 14), "weekly": ("Haftalik", 12), "monthly": ("Aylik", 12)}[period]
        self.log(f"[cyan]📊 {tg('TOKEN')} Claude token kullanimi okunuyor: {escape(self.root_dir)}[/cyan]")
        projects = self._ccusage_daily()
        if projects is None:
            if not self.cancelled:
                self.prog("HATA", 0.0, "❌ Token kullanimi okunamadi.")
                self._hold_result = True
            return

        # Claude Code proje klasorunu yoldan turetir: harf / rakam disindaki her karakter '-' olur.
        slug = re.sub(r"[^A-Za-z0-9]", "-", self.root_dir).lower()
        matched = sorted(k for k in projects if k.lower() == slug or k.lower().startswith(slug + "-"))
        fields = self.TOKEN_FIELDS
        buckets: dict[str, dict[str, int]] = {}
        for name in matched:
            for row in projects[name]:
                try:
                    day = datetime.strptime(str(row.get("date", ""))[:10], "%Y-%m-%d")
                except ValueError:
                    continue
                if period == "weekly":
                    key = (day - timedelta(days=day.weekday())).strftime("%Y-%m-%d")
                else:
                    key = day.strftime("%Y-%m" if period == "monthly" else "%Y-%m-%d")
                bucket = buckets.setdefault(key, dict.fromkeys(fields, 0))
                for field in fields:
                    bucket[field] += int(row.get(field) or 0)

        self._hold_result = True
        if not buckets:
            self.prog("TAMAMLANDI", 100.0, "Bu proje icin Claude oturumu yok.")
            self.log(f"[yellow]📊 {tg('TOKEN')} Bu proje icin Claude oturumu bulunamadi (aranan klasor: {escape(slug)}).[/yellow]")
            return

        keys = sorted(buckets)
        shown = keys if to_json else keys[-limit:]
        total = dict.fromkeys(fields, 0)
        for key in shown:
            for field in fields:
                total[field] += buckets[key][field]

        if to_json:
            data = {
                "project": self.root_dir,
                "agent": "claude",
                "period": period,
                "generatedAt": datetime.now().isoformat(timespec="seconds"),
                "claudeProjects": matched,
                "rows": [{"period": key, **buckets[key]} for key in keys],
                "totals": total,
            }
            path = os.path.join(self._downloads_dir(), f"proman_tokens_{period}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json")
            try:
                os.makedirs(os.path.dirname(path), exist_ok=True)
                with open(path, "w", encoding="utf-8") as f:
                    json.dump(data, f, indent=2, ensure_ascii=False)
            except OSError as e:
                self.prog("HATA", 0.0, "❌ JSON dosyasi yazilamadi.")
                self.log(f"[red]❌ {tg('TOKEN')} JSON dosyasi yazilamadi: {escape(str(e))}[/red]")
                return
            self.log(f"[bold green]✅ {tg('TOKEN')} {title} JSON kaydedildi ({len(keys)} satir): {escape(path)}[/bold green]")
            self.prog("TAMAMLANDI", 100.0, f"✅ Token JSON: {os.path.basename(path)}")
            return

        scope = f"son {len(shown)}" if len(keys) > len(shown) else "tumu"
        head = {"daily": "Gun", "weekly": "Hafta (Pzt)", "monthly": "Ay"}[period]

        def cells(b: dict[str, int]) -> list[str]:
            cache = b["cacheCreationTokens"] + b["cacheReadTokens"]
            return [self._fmt_tokens(v) for v in (b["inputTokens"], b["outputTokens"], cache, b["totalTokens"])]

        table = [(key, cells(buckets[key])) for key in shown] + [("TOPLAM", cells(total))]
        titles = ["Girdi", "Cikti", "Cache", "Toplam"]
        widths = [max(len(titles[i]), *(len(c[i]) for _, c in table)) + 2 for i in range(4)]

        def line(label: str, values: list[str]) -> str:
            return f"{label:<11}" + "".join(f"{v:>{w}}" for v, w in zip(values, widths))

        rule = "[dim]" + "─" * (11 + sum(widths)) + "[/dim]"
        # Tek log kaydi: log yonu (yeni ustte / altta) ne olursa olsun tablo bozulmadan okunur.
        rows = [f"[bold cyan]📊 {tg('TOKEN')} Claude · {escape(self.project_name)} · {title} ({scope})[/bold cyan]"]
        rows.append(f"[bold]{line(head, titles)}[/bold]")
        rows.append(rule)
        rows.extend(line(label, values) for label, values in table[:-1])
        rows.append(rule)
        rows.append(f"[bold green]{line(*table[-1])}[/bold green]")
        if len(matched) > 1:
            rows.append(f"[dim]{escape(f'{len(matched)} klasor: ' + ', '.join(matched))}[/dim]")
        self.log("\n".join(rows))
        self.prog("TAMAMLANDI", 100.0, f"✅ Token kullanimi: {title}, toplam {self._fmt_tokens(total['totalTokens'])}.")


    # ------------------ Komut Akis Motoru ------------------
    def _stream(self, cmd: str, cwd: str, tag: str, count_word: str = "") -> bool:
        """Komutu calistirir, ciktisini log'a akitir. Basariliysa True.
        Yuzde bilinmedigi icin cubuk belirsiz (akan) kalir; gosterilen sayilar gercek: satir sayisi ve
        (count_word verilmisse) o kelimeyi iceren satir sayisi.
        Cikti ayri bir thread'de okunur: iptal istegi, komut hic cikti vermese veya boruyu baska bir surec
        (ornegin gradle daemon) acik tutsa bile en gec 0.2 sn icinde gorulur."""
        start_time = time.time()
        state = f"CALISIYOR: {tag}"
        lines = 0
        counted = 0
        last_prog = 0.0
        self.prog(state, None, f"{tag} baslatildi...")

        try:
            process = subprocess.Popen(
                cmd,
                cwd=cwd,
                shell=True,
                stdin=subprocess.DEVNULL,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                encoding="utf-8",
                errors="replace",
                bufsize=1,
            )
        except Exception as e:
            self.log(f"[red]❌ {tg(tag)} Hata: {escape(str(e))}[/red]")
            self.prog("HATA", 0.0, str(e))
            self._hold_result = True
            return False

        self.active_subprocess = process
        out: queue.Queue = queue.Queue()

        def _reader() -> None:
            try:
                for raw in process.stdout:  # type: ignore[union-attr]
                    out.put(raw)
            except Exception:
                pass
            out.put(None)

        threading.Thread(target=_reader, daemon=True).start()

        exited_at = 0.0
        while not self.cancelled:
            try:
                line = out.get(timeout=0.2)
            except queue.Empty:
                if process.poll() is not None:
                    # Surec bitti ama boru kapanmadi: kalan cikti icin kisa sure beklenir, sonra birakilir.
                    exited_at = exited_at or time.time()
                    if time.time() - exited_at > 1.0:
                        break
                continue
            if line is None:
                break
            clean = line.rstrip()
            if not clean:
                continue
            lines += 1
            if count_word and count_word in clean:
                counted += 1
            self.log(f"[dim]  {tg(tag)} {escape(clean)}[/dim]")
            now = time.time()
            if now - last_prog >= 0.2:
                last_prog = now
                info = f"cikti: {lines} satir"
                if count_word:
                    info += f"  │  {count_word}: {counted}"
                self.prog(state, None, clean[:70], info)

        while process.poll() is None and not self.cancelled:
            time.sleep(0.1)

        if self.cancelled:
            self._kill_tree(process)
            self.active_subprocess = None
            self.log(f"[bold red]🛑 {tg(tag)} Islem kullanici tarafindan sonlandirildi.[/bold red]")
            return False

        code = process.returncode
        self.active_subprocess = None
        elapsed = time.time() - start_time
        el_str = f"{int(elapsed // 60):02d}:{int(elapsed % 60):02d}"
        self._hold_result = True
        if code == 0:
            self.prog("TAMAMLANDI", 100.0, f"✅ {tag} basariyla bitti ({el_str}).")
            self.log(f"[bold green]✅ {tg(tag)} Islem basariyla tamamlandi ({el_str}).[/bold green]")
            return True
        self.prog("HATA", 0.0, f"❌ {tag} basarisiz (kod {code}).")
        self.log(f"[bold red]❌ {tg(tag)} Basarisiz (exit code: {code}).[/bold red]")
        return False


# =====================================================================
# TUI BILESENLERI (CYBERPUNK / HIGH-DENSITY DASHBOARD)
# =====================================================================

class LogLineItem(ListItem):
    """Otomatik wrap ozellikli log satiri. Cift tiklaninca secilir (tek secim) ve panoya kopyalanir."""

    def __init__(self, markup_text: str, raw_text: str = "", num: int = 0) -> None:
        super().__init__()
        self.markup_text = markup_text
        self.num = num
        self.raw_text = raw_text or ANSI_RE.sub("", plain_of(markup_text))

    def compose(self) -> ComposeResult:
        yield Label(self.markup_text, classes="log-item-text", markup=True)

    def on_click(self, event: Click) -> None:
        if event.chain >= 2:
            event.stop()
            self.app.select_log_line(self)


class StatBox(Static):
    """Gorseldeki cerceveli stat kutularini olusturur."""

    def __init__(self, title: str, box_id: str, **kwargs) -> None:
        super().__init__(id=box_id, **kwargs)
        self.box_title = title

    def compose(self) -> ComposeResult:
        yield Label(f"*{self.box_title}", classes="box-title")
        yield Label("", id=f"{self.id}-content", classes="box-content")

    def update_content(self, text: str) -> None:
        try:
            self.query_one(f"#{self.id}-content", Label).update(text)
        except Exception:
            pass


# Project & Host kutusundaki etiket sutununun genisligi ("PostgreSQL" sigacak kadar)
HOST_LABEL_W = 10


class CopyLine(Static):
    """Tek satirlik 'etiket: deger'. Tiklaninca degeri panoya kopyalar."""

    DEFAULT_CSS = """
    CopyLine {
        height: 1;
        color: #cbd5e1;
        /* Uzun adres alt satira kayip gorunmez olmasin: tek satir, sigmazsa sonu kisalir */
        text-wrap: nowrap;
        text-overflow: ellipsis;
    }
    CopyLine:hover {
        background: #14223b;
        text-style: underline;
    }
    """

    def __init__(self, key_label: str, color: str, tip: str = "", **kwargs) -> None:
        super().__init__("", **kwargs)
        self.key_label = key_label
        self.color = color
        self.value = ""
        self.tooltip = f"{tip}\nTikla: panoya kopyala" if tip else "Tikla: panoya kopyala"

    def set_value(self, value: str) -> None:
        if value == self.value:
            return
        self.value = value
        self.update(f"{self.key_label:<{HOST_LABEL_W}}: [bold {self.color}]{escape(value)}[/]")

    def on_click(self, event: Click) -> None:
        event.stop()
        if self.value and not self.value.startswith("("):
            self.app.copy_value(self.value)


class SysBox(StatBox):
    """Sistem kullanimi + altinda calisan isin durumu (ad, durum / iptal, sure, son cikti)."""

    def compose(self) -> ComposeResult:
        yield Label(f"*{self.box_title}", classes="box-title")
        yield Label("", id=f"{self.id}-content", classes="box-content")
        yield Label("", id="op-task", classes="op-line")
        yield Label("", id="op-state", classes="op-line")
        yield Label("", id="op-info", classes="op-line")


class HostBox(StatBox):
    """Proje / host ozeti. Adres satirlari tiklanarak kopyalanir."""

    def compose(self) -> ComposeResult:
        yield Label(f"*{self.box_title}", classes="box-title")
        yield Label("", id=f"{self.id}-content", classes="box-content")
        # Projenin sundugu / baglandigi tum adresler. Aciklama satirin uzerine gelince (tooltip) gorunur.
        yield CopyLine("LAN IP", "#facc15", "Bu bilgisayarin ag adresi", id="copy-local-ip")
        yield CopyLine("API", "#34d399", "API sunucusu (apps/api). Ayni agdaki cihazlar bu adresten erisir", id="copy-api-url")
        yield CopyLine("Web panel", "#38bdf8", "Admin / musteri paneli (Vite). Sadece bu bilgisayardan acilir", id="copy-web-url")
        yield CopyLine("Expo Go", "#c084fc", "Metro / Expo Go adresi (QR ile ayni; 'e' tusu)", id="copy-expo-url")
        yield CopyLine(
            "Tablet API",
            "#f472b6",
            "Mobil uygulamanin baglandigi API (apps/mobile/.env EXPO_PUBLIC_API_URL; 't' ile degisir)",
            id="copy-target",
        )
        yield CopyLine("PostgreSQL", "#fb923c", "Uygulama veritabani (apps/api/.env DATABASE_URL)", id="copy-pg")
        yield CopyLine("MSSQL ERP", "#fb923c", "ERP veritabani, salt okunur. Bicim: sunucu\\instance,port", id="copy-mssql")


class CustomUrlModal(ModalScreen[str]):
    """Tabletin baglanacagi sunucu adresi: otomatik (ag adresi) veya elle yazma. Otomatik secilirse AUTO_URL doner."""

    DEFAULT_CSS = """
    CustomUrlModal, PickModal {
        align: center middle;
        background: #050811 70%;
    }
    #modal-box {
        height: auto;
    }
    .modal-wide-btn {
        width: 100%;
        margin-bottom: 1;
    }
    """

    BINDINGS = [
        Binding("escape", "cancel", "Cancel", priority=True),
    ]

    def __init__(self, current: str, manual: bool, lan_url: str) -> None:
        super().__init__()
        self.current = current
        self.manual = manual
        self.lan_url = lan_url

    def compose(self) -> ComposeResult:
        with Vertical(id="modal-box"):
            yield Label("📱 Tabletin baglanacagi sunucu (API) adresi", id="modal-title")
            yield Label(f"Su an: {escape(self.current)}  ({'elle' if self.manual else 'otomatik'})", id="help-content")
            yield Button(f"Otomatik (ag adresi)  {self.lan_url}", id="btn-preset-lan", classes="modal-wide-btn")
            yield Input(placeholder="Elle yaz: http://192.168.1.50:3003", id="modal-input")
            with Horizontal(id="modal-btns"):
                yield Button("Kaydet (Enter)", variant="success", id="btn-save")
                yield Button("Vazgec (Esc)", variant="error", id="btn-cancel")

    def action_cancel(self) -> None:
        self.dismiss("")

    def on_button_pressed(self, event: Button.Pressed) -> None:
        event.stop()
        btn_id = event.button.id or ""
        if btn_id == "btn-preset-lan":
            self.dismiss(AUTO_URL)
        elif btn_id == "btn-save":
            self.dismiss(self.query_one("#modal-input", Input).value.strip())
        else:
            self.dismiss("")

    def on_input_submitted(self, event: Input.Submitted) -> None:
        self.dismiss(event.value.strip())


class PickModal(ModalScreen[Optional[str]]):
    """Listeden tek secim (ornek: derlemenin kurulacagi cihaz). Esc = vazgec."""

    BINDINGS = [
        Binding("escape", "cancel", "Cancel", priority=True),
    ]

    def __init__(self, title: str, options: list[tuple[str, str]]) -> None:
        super().__init__()
        self.pick_title = title
        self.options = options

    def compose(self) -> ComposeResult:
        with Vertical(id="modal-box"):
            yield Label(self.pick_title, id="modal-title")
            for i, (_, label) in enumerate(self.options):
                yield Button(escape(label), id=f"btn-pick-{i}", classes="modal-wide-btn")
            yield Button("Vazgec (Esc)", variant="error", id="btn-cancel")

    def action_cancel(self) -> None:
        self.dismiss(None)

    def on_button_pressed(self, event: Button.Pressed) -> None:
        event.stop()
        btn_id = event.button.id or ""
        if btn_id.startswith("btn-pick-"):
            self.dismiss(self.options[int(btn_id.rsplit("-", 1)[1])][0])
        else:
            self.dismiss(None)


class QrModal(ModalScreen[None]):
    """Expo QR kodu: telefonda Expo Go ile okutulur. Esc / Enter / tiklama kapatir."""

    DEFAULT_CSS = """
    QrModal {
        align: center middle;
        background: #050811 70%;
    }
    #qr-box {
        width: auto;
        height: auto;
        background: #091329;
        border: thick #00d2ff;
        padding: 1 2;
        align: center middle;
    }
    #qr-box Label {
        width: auto;
        text-wrap: nowrap;
    }
    #qr-title {
        color: #38bdf8;
        text-style: bold;
        margin-bottom: 1;
    }
    #qr-url {
        color: #facc15;
        text-style: bold;
        margin-top: 1;
    }
    #qr-hint {
        color: #94a3b8;
    }
    """

    BINDINGS = [
        Binding("enter", "close", "Close"),
    ]

    def __init__(self, url: str, running: bool) -> None:
        super().__init__()
        self.url = url
        self.running = running

    def compose(self) -> ComposeResult:
        with Vertical(id="qr-box"):
            yield Label("📱 Expo QR  (Expo Go ile okut)", id="qr-title")
            yield Label("\n".join(qr_markup(self.url)), id="qr-code", markup=True)
            yield Label(escape(self.url), id="qr-url")
            if self.running:
                yield Label("Telefon ayni Wi-Fi aginda olmali.  Esc: kapat", id="qr-hint")
            else:
                yield Label("[#ef4444]Mobil (Expo) calismiyor: once '5' ile baslat.[/]  Esc: kapat", id="qr-hint")

    def on_mount(self) -> None:
        self.call_after_refresh(self._center_on_log_box)

    def _center_on_log_box(self) -> None:
        """Pencereyi sag paneldeki log alaninin ortasina alir (sol taraftaki durum kutulari gorunur kalsin)."""
        try:
            r = self.app.screen_stack[-2].query_one("#log-box").region
            box = self.query_one("#qr-box")
            size = box.outer_size
            self.styles.align = ("left", "top")
            box.styles.margin = (max(0, r.y + (r.height - size.height) // 2), 0, 0, max(0, r.x + (r.width - size.width) // 2))
        except Exception:
            pass

    def action_close(self) -> None:
        self.dismiss(None)

    def on_click(self, event: Click) -> None:
        event.stop()
        self.dismiss(None)


class ExitConfirmModal(ModalScreen[bool]):
    """Ekranin ortasinda cikis onayi. Enter = Exit, Esc = pencereyi kapat."""

    DEFAULT_CSS = """
    ExitConfirmModal {
        align: center middle;
        background: #050811 70%;
    }
    #exit-box {
        width: 64;
        height: auto;
        background: #091329;
        border: thick #f43f5e;
        padding: 1 2;
    }
    #exit-title {
        width: 100%;
        content-align: center middle;
        color: #f43f5e;
        text-style: bold;
        margin-bottom: 1;
    }
    #exit-text {
        width: 100%;
        content-align: center middle;
        color: #cbd5e1;
        margin-bottom: 1;
    }
    #exit-btns {
        width: 100%;
        height: auto;
        layout: horizontal;
    }
    #exit-btns Button {
        width: 1fr;
        margin: 0 1;
    }
    """

    BINDINGS = [
        Binding("escape", "cancel_exit", "Cancel", priority=True),
    ]

    def compose(self) -> ComposeResult:
        with Vertical(id="exit-box"):
            yield Label("🚪 PROMAN'dan cikis", id="exit-title")
            yield Label("Uygulamadan cikmak istiyor musun?", id="exit-text")
            with Horizontal(id="exit-btns"):
                yield Button("Exit", variant="error", id="btn-exit-yes")
                yield Button("Cancel", variant="primary", id="btn-exit-no")

    def on_mount(self) -> None:
        self.query_one("#btn-exit-yes", Button).focus()

    def action_cancel_exit(self) -> None:
        self.dismiss(False)

    def on_button_pressed(self, event: Button.Pressed) -> None:
        event.stop()
        self.dismiss(event.button.id == "btn-exit-yes")


# F9 menu agaci. Dugum: (emoji, metin, yardim, hedef). hedef = eylem metodunun adi, ya da alt menu (dugum listesi).
# Numaralar ([1], [2] ...) her seviyede sirayla otomatik verilir.
# Not: Terminalde hizalama bozulmasin diye VS16 (U+FE0F) gerektirmeyen emojiler secildi.
PROMAN_MENU = [
    ("🚀", "Sistem", "Baslat / durdur, ESync, Mobil (Expo), durum", [
        ("🚀", "System Baslat (API + Web)", "API ve Web servislerini baslatir", "action_quick_start"),
        ("🛑", "System Durdur (hepsi)", "Mobil, Web ve API servislerini durdurur", "action_quick_stop"),
        ("🔁", "ESync'i Calistir", "Son hali: acik olani kapat, derle, baslat", "action_run_esync"),
        ("📱", "Mobil (Expo) Baslat / Yeniden Ac", "Expo'yu (yeniden) baslatir", "action_mobile_start"),
        ("⛔", "Mobil (Expo) Durdur", "Expo'yu kapatir", "action_mobile_stop"),
        ("🧹", "Mobil (Expo) Cache Clear", "Durdurur, onbellegi temizleyerek baslatir", "action_mobile_clean"),
        ("🔳", "Mobil (Expo) QR Kodu", "Expo Go ile okutulacak QR kodunu gosterir", "action_show_qr"),
        ("🔄", "Durumu Yenile", "Port, surec ve sistem metriklerini yeniler", "action_refresh_status"),
    ]),
    ("🧰", "Araclar", "Migration, sistem bilgisi, NPM", [
        ("💾", "Veritabani Migration Uygula", "npm run db:migrate", "action_run_migrations"),
        ("💻", "Sistem & Arac Bilgisi", "Node, NPM, Rust, Python surumleri ve bagimlilik durumu", "action_system_info"),
        ("📦", "Bagimliliklari (NPM) Kur / Guncelle", "Kok dizinde npm install", "action_run_npm"),
    ]),
    ("📟", "Tablet (Android)", "WSA, sunucu adresi, mobil derleme", [
        ("📟", "Tablet + API + WSA Calistir", "API + WSA (Android) + uygulama, tek tus", "action_start_tablet"),
        ("📱", "Expo GO Baslat", "Tabletteki Expo Go'yu (aciksa kapatip) acar; ana ekraninda kalir (API, WSA, Metro'ya dokunmaz)", "action_start_tablet_app"),
        ("📺", "Sadece WSA'yi Ac", "Hazirlik kontrolleri, WSA, ADB; Android'in hazir olmasini bekler", "action_start_wsa"),
        ("📴", "WSA'yi Kapat", "Android alt sistemini kapatir (RAM serbest kalir)", "action_stop_wsa"),
        ("🔁", "WSA Oto-baslangic", "WSA'nin Windows acilisinda kendiliginden baslamasi (Android OS degil)", [
            ("🔎", "Durumu Goster", "Iki gorevin durumunu loga yazar; canli durum tabloda 'WSA - Auto'", "action_wsa_auto_info"),
            ("⏹️", "Oto-baslangici Durdur", "Acilista kendiliginden baslamasin (iki gorev de kapanir)", "action_wsa_auto_off"),
            ("▶️", "Oto-baslangici Calistir", "Acilista kismi modda (As needed) kendiliginden baslasin", "action_wsa_auto_on"),
        ]),
        ("🔗", "Tabletin Sunucu Adresini Sec", "Otomatik (ag adresi) / elle (EXPO_PUBLIC_API_URL)", "action_modal_ip"),
        ("🔨", "Mobil Derleme", "Cihaza gercek uygulama olarak kurar; Expo Go gerekmez", [
            ("📲", "Android · Debug    cihaza kur", "Telefon / tablet / emulator; kod degisince canli yenilenir", "action_build_debug"),
            ("📲", "Android · Release  cihaza kur", "Bilgisayardan bagimsiz calisir", "action_build_release"),
            ("📦", "Android · Release  APK dosyasi uret", "Cihaza kurmaz", "action_build_apk"),
            ("🍎", "iOS · Debug", "Mac ve Xcode gerekir; bu bilgisayarda calismaz", "action_ios_info"),
            ("🍎", "iOS · Release", "Mac ve Xcode gerekir; bu bilgisayarda calismaz", "action_ios_info"),
        ]),
    ]),
    ("📊", "Token Kullanimi (Claude)", "Bu projenin Claude Code token kullanimi (ccusage)", [
        ("📅", "Gunluk", "Son 14 gun, gun gun", "action_tokens_daily"),
        ("📆", "Haftalik", "Son 12 hafta; hafta Pazartesi baslar", "action_tokens_weekly"),
        ("📈", "Aylik", "Son 12 ay", "action_tokens_monthly"),
        ("💾", "Gunluk  → JSON dosyasi", "Tum gunler; Downloads klasorune kaydeder", "action_tokens_daily_json"),
        ("💾", "Haftalik → JSON dosyasi", "Tum haftalar; Downloads klasorune kaydeder", "action_tokens_weekly_json"),
        ("💾", "Aylik   → JSON dosyasi", "Tum aylar; Downloads klasorune kaydeder", "action_tokens_monthly_json"),
    ]),
    ("📋", "Kuyruk", "Siradaki komutlar; secileni iptal et / hepsini temizle (calisan is etkilenmez)", "@queue"),
    ("📸", "Screenshot", "Mevcut ekranin PNG screenshot'ini Downloads klasorune kaydeder", "action_take_screenshot"),
    ("🚪", "Exit", "PROMAN kapatilir", "action_quit"),
]


class PromanCommandProvider(Provider):
    """F9 menusu: uygulamanin o an bulundugu menu seviyesini (ana menu veya bir alt grup) listeler."""

    # "🚀 [1]  " = emoji(2) + bosluk(1) + "[1]"(3) + bosluk(2) = 8 hucre
    HELP_INDENT = " " * 8

    def _entries(self) -> list[tuple[str, object, str]]:
        """(etiket, cagrilacak fonksiyon, yardim) listesi."""
        app = self.app
        entries: list[tuple[str, object, str]] = []
        for index, (emoji, text, help_text, target) in enumerate(app.menu_level()):
            if not app.menu_path:
                help_text = ""  # Ana menu sade kalsin: aciklama sadece alt menulerde gosterilir.
            label = f"{emoji} [{index + 1}]  {text}"
            if target == "@queue":
                label = f"{emoji} [{index + 1}]  {text} ({app.queue_count()})"
                entries.append((f"{label}  ▸", partial(app.open_submenu, index), help_text))
            elif isinstance(target, str) and target.startswith("@cancel:"):
                entries.append((label, partial(app.cancel_queued, int(target[8:])), help_text))
            elif target == "@clearq":
                entries.append((label, app.clear_queue, help_text))
            elif isinstance(target, list):
                entries.append((f"{label}  ▸", partial(app.open_submenu, index), help_text))
            else:
                callback = getattr(app, target, None)
                if callback:
                    entries.append((label, callback, help_text))
        if app.menu_path:
            # Sonda: alt menu acilinca ilk komut secili gelsin, Enter yanlislikla geri donmesin.
            entries.append(("↩       Geri", app.action_menu_back, "Ust menuye don (Esc)"))
        return entries

    async def discover(self) -> Hits:
        """Arama kutusu bosken seviyedeki tum komutlari listeler."""
        for label, callback, help_text in self._entries():
            yield DiscoveryHit(Content(label), callback, text=label, help=self.HELP_INDENT + help_text if help_text else None)

    def _all_commands(self, level: Optional[list] = None, path: str = "") -> list[tuple[str, object, str]]:
        """Tum agactaki calistirilabilir komutlar (gruplar haric), yoluyla: 'Tablet (Android) > Mobil Derleme > ...'."""
        out: list[tuple[str, object, str]] = []
        for emoji, text, help_text, target in PROMAN_MENU if level is None else level:
            if isinstance(target, list):
                out.extend(self._all_commands(target, f"{path}{text} > "))
            else:
                callback = getattr(self.app, target, None)
                if callback:
                    out.append((f"{emoji}  {path}{text}", callback, help_text))
        return out

    async def search(self, query: str) -> Hits:
        """Yazinca arama seviyeye bakmaz: tum agactaki komutlar duz liste olarak gelir.
        Sadece rakam yazilirsa (ornegin 2) o an gorunen seviyedeki o numarali oge secilir."""
        query = query.strip()
        if query.isdigit():
            for label, callback, help_text in self._entries():
                if f"[{query}]" in label:
                    yield Hit(1.0, Content(label), callback, text=label, help=self.HELP_INDENT + help_text if help_text else None)
            return
        matcher = self.matcher(query)
        for label, callback, help_text in self._all_commands():
            score = matcher.match(label)
            if score > 0:
                # "🚀  " = emoji(2) + bosluk(2) = 4 hucre
                yield Hit(score, matcher.highlight(label), callback, text=label, help="    " + help_text)


class PromanPalette(CommandPalette):
    """Native Command Palette; sag paneldeki #log-box alanina birebir oturur."""

    DEFAULT_CSS = """
    PromanPalette {
        align-horizontal: left;
        background: #050811 40%;
    }
    PromanPalette > #--container {
        margin: 0;
        visibility: visible;
        background: #060b17;
        border: round #38bdf8;
        border-title-color: #38bdf8;
        border-title-style: bold;
        padding: 0;
    }
    PromanPalette #--input {
        border: none;
        border-bottom: solid #1e3a5f;
        background: #091329;
    }
    PromanPalette #--results {
        overlay: none;
        height: 1fr;
    }
    PromanPalette CommandList {
        height: 1fr;
        max-height: 100%;
        background: #060b17;
        border: none;
    }
    """

    def on_mount(self) -> None:
        self.query_one("#--container").border_title = f"*{self.app.menu_title()} [ F9 / Esc ]"
        self.call_after_refresh(self._fit_to_log_box)

    def on_resize(self) -> None:
        self.call_after_refresh(self._fit_to_log_box)

    def _fit_to_log_box(self) -> None:
        try:
            base = self.app.screen_stack[-2]
            r = base.query_one("#log-box").region
            c = self.query_one("#--container")
            c.styles.margin = (r.y, 0, 0, r.x)
            c.styles.width = r.width
            c.styles.height = r.height
        except Exception:
            pass



class PromanApp(App):
    """PROMAN High-Density Dashboard Application."""

    # Sadece PROMAN komutlari; Textual sistem komutlari (Keys, Maximize, Quit, Theme...) bilerek eklenmedi.
    COMMANDS = {PromanCommandProvider}

    TITLE = "PROMAN v2.0"
    SUB_TITLE = "F9 menu"

    CSS = """
    Screen {
        background: #050811;
        color: #94a3b8;
    }

    Header {
        background: #080f1e;
        color: #38bdf8;
        height: 3;
        border-bottom: solid #1e3a5f;
    }

    /* MAIN TWO-COLUMN SPLIT LAYOUT */
    #main-layout {
        height: 1fr;
        layout: horizontal;
        padding: 0 1;
        background: #050811;
    }

    /* SOL PANEL (%48) */
    #left-column {
        width: 48%;
        height: 100%;
        layout: vertical;
        padding: 0;
    }

    /* Canli islem kutusu: iki ust kutunun altinda tam genislik, o anki isin ayrintisi */
    #op-box {
        height: 4;
        width: 100%;
        background: #091122;
        border: round #1e3a5f;
        margin: 0 1;
        padding: 0 1;
    }

    #top-stats-row {
        height: 14;
        layout: horizontal;
        margin-bottom: 0;
    }

    StatBox {
        width: 1fr;
        height: 100%;
        background: #091122;
        border: round #1e3a5f;
        margin: 0 1;
        padding: 0 1;
    }

    /* Adres satirlari sigsin diye proje kutusu daha genis */
    #box-status {
        width: 3fr;
    }

    #box-sys {
        width: 2fr;
    }

    StatBox:hover {
        border: round #00d2ff;
    }

    .box-title {
        color: #38bdf8;
        text-style: bold;
        margin-bottom: 0;
    }

    .box-content {
        color: #cbd5e1;
        text-style: none;
    }

    /* AKTIF IS SATIRLARI (System Utilization kutusunun altinda) */
    .op-line {
        width: 100%;
        height: 1;
        color: #cbd5e1;
        text-wrap: nowrap;
        text-overflow: ellipsis;
    }

    /* PROCESSLIST TABLE */
    #process-box {
        height: 1fr;
        width: 100%;
        background: #080f1f;
        border: round #1e3a5f;
        margin: 0 1;
        padding: 0 1;
    }

    DataTable {
        height: 1fr;
        background: #080f1f;
        color: #cbd5e1;
    }

    DataTable > .datatable--header {
        background: #0f1d38;
        color: #38bdf8;
        text-style: bold;
    }

    /* SAG PANEL: ACTIVITY LOG (TAM BOY) */
    #log-box {
        width: 1fr;
        height: 100%;
        margin: 0 1;
        background: #060b17;
        border: round #1e3a5f;
        padding: 0 1;
        layout: vertical;
    }

    #log-header {
        height: 3;
        layout: horizontal;
        align: left middle;
        border-bottom: solid #1e3a5f;
        margin-bottom: 0;
        padding: 0;
    }

    #log-box-title {
        width: 1fr;
        color: #38bdf8;
        text-style: bold;
    }

    .log-tool-btn {
        height: 1;
        min-width: 9;
        margin-left: 1;
        padding: 0 1;
        border: none;
        background: #14223b;
        color: #94a3b8;
        text-style: bold;
    }

    .log-tool-btn:hover {
        background: #0284c7;
        color: #ffffff;
    }

    #btn-log-copy:hover {
        background: #16a34a;
        color: #ffffff;
    }

    #btn-log-clear:hover {
        background: #dc2626;
        color: #ffffff;
    }

    #btn-log-reverse {
        background: #1e3a5f;
        color: #e0f2fe;
    }

    #main-log-list {
        height: 1fr;
        background: #060b17;
        border: none;
        padding: 0;
        scrollbar-gutter: stable;
    }

    LogLineItem {
        height: auto;
        min-height: 1;
        padding: 0 1;
        margin: 0;
        background: transparent;
        border-left: solid transparent;
    }

    LogLineItem:hover {
        background: #0f1c36;
    }

    /* Tek tik / ok tuslari: ListView'in kendi imleci, silik kalir */
    #main-log-list > LogLineItem.-highlight {
        background: #0f1c36;
    }

    /* Cift tikla secilen (ve kopyalanan) satir */
    #main-log-list > LogLineItem.-selected-line {
        background: #854d0e;
        border-left: thick #facc15;
    }

    #main-log-list > LogLineItem.-selected-line .log-item-text {
        color: #fef9c3;
        text-style: bold;
    }

    .log-item-text {
        width: 100%;
        color: #cbd5e1;
    }

    /* BOTTOM COMMAND BAR */
    #command-bar {
        height: 3;
        background: #080f1e;
        border-top: solid #1e3a5f;
        layout: horizontal;
        align: center middle;
        padding: 0 2;
    }

    .cmd-btn-menu {
        height: 2;
        min-width: 18;
        margin: 0 2;
        padding: 0 2;
        border: none;
        background: #1e3a8a;
        color: #93c5fd;
        text-style: bold;
    }

    .cmd-btn-menu:hover {
        background: #2563eb;
        color: #ffffff;
    }

    .cmd-btn-abort {
        height: 2;
        min-width: 18;
        margin: 0 2;
        padding: 0 2;
        border: none;
        background: #450a0a;
        color: #f87171;
        text-style: bold;
    }

    .cmd-btn-abort:hover {
        background: #dc2626;
        color: #ffffff;
    }

    .cmd-btn-refresh {
        height: 2;
        min-width: 18;
        margin: 0 2;
        padding: 0 2;
        border: none;
        background: #064e3b;
        color: #6ee7b7;
        text-style: bold;
    }

    .cmd-btn-refresh:hover {
        background: #059669;
        color: #ffffff;
    }

    .cmd-btn-quit {
        height: 2;
        min-width: 18;
        margin: 0 2;
        padding: 0 2;
        border: none;
        background: #4c0519;
        color: #fb7185;
        text-style: bold;
    }

    .cmd-btn-quit:hover {
        background: #e11d48;
        color: #ffffff;
    }

    /* MODAL STYLING */
    #modal-box, #help-box {
        width: 65;
        background: #091329;
        border: thick #00d2ff;
        padding: 1 2;
        align: center middle;
    }

    #modal-title, #help-title {
        color: #38bdf8;
        text-style: bold;
        margin-bottom: 1;
    }

    #modal-input {
        width: 100%;
        margin-bottom: 1;
    }

    #modal-btns {
        layout: horizontal;
        align: center middle;
    }

    #modal-btns Button {
        margin: 0 1;
        width: 20;
    }

    #help-content {
        margin-bottom: 1;
        color: #cbd5e1;
    }
    """

    BINDINGS = [
        ("f9", "command_palette", "Menu"),
        ("f5", "refresh_status", "Refresh"),
        ("r", "refresh_status", "Refresh"),
        # priority: Esc her ekranda (F9 menusu, pencereler, odak nerede olursa olsun) once buraya gelir.
        Binding("escape", "escape_key", "Abort / Close / Quit", priority=True),
        ("x", "abort_task", "Abort Task"),
        ("1", "quick_start", "Start System"),
        ("2", "quick_stop", "Stop System"),
        ("3", "toggle_api", "API"),
        ("4", "toggle_web", "Web"),
        ("5", "toggle_mobile", "Mobil"),
        ("6", "start_tablet", "Tablet"),
        ("7", "run_esync", "ESync"),
        ("8", "run_migrations", "Migrate"),
        ("9", "run_npm", "NPM"),
        ("0", "build_apk", "APK"),
        ("t", "modal_ip", "Target IP"),
        ("e", "show_qr", "Expo QR"),
        ("y", "copy_all_logs", "Copy Log"),
        ("o", "toggle_log_order", "Log Order"),
        ("c", "clear_log", "Clear"),
        ("question_mark", "command_palette", "Command Palette"),
        ("q", "confirm_quit", "Quit"),
    ]

    def __init__(self) -> None:
        super().__init__()
        self.engine = ProcessEngine(log_cb=self.log_message, prog_cb=self.update_progress_ui, pick_cb=self.pick_from_thread)
        self.app_start_time = time.time()
        self._op_info = ""
        self._op_state = "IDLE"
        self._op_detail = "Sistem hazir."
        self.menu_path: list[int] = []
        self.title = f"PROMAN v2.0 • {self.engine.project_name}"
        self.sub_title = f"{self.engine.root_dir} • F9 menu"
        self._refreshing = False
        self._log_entries: list[tuple[int, str, str]] = []  # (numara, markup, raw)
        self._log_counter = 0
        self._log_newest_top = self._load_ui_pref().get("log_newest_top", True)
        self._queue: list[dict] = []  # bekleyen komutlar: {id, name, fn}; en yeni sonda
        self._queue_lock = threading.Lock()
        self._queue_seq = 0

    # ------------------ Log akis yonu (kalici ayar) ------------------
    UI_PREF_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "proman_ui.json")

    def _load_ui_pref(self) -> dict:
        try:
            with open(self.UI_PREF_FILE, encoding="utf-8") as f:
                data = json.load(f)
            return data if isinstance(data, dict) else {}
        except Exception:
            return {}

    def _save_ui_pref(self) -> None:
        try:
            data = self._load_ui_pref()
            data["log_newest_top"] = self._log_newest_top
            with open(self.UI_PREF_FILE, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2)
        except Exception:
            pass

    def _reverse_label(self) -> str:
        return "⬆ Yeni ustte [ o ]" if self._log_newest_top else "⬇ Yeni altta [ o ]"

    @staticmethod
    def _num_badge(num: int) -> str:
        return f"[bold #060b17 on #38bdf8] {num:04d} [/] "

    def _make_log_item(self, entry: tuple[int, str, str]) -> LogLineItem:
        num, markup, raw = entry
        return LogLineItem(markup_text=self._num_badge(num) + markup, raw_text=raw, num=num)

    def action_toggle_log_order(self) -> None:
        """Log akis yonunu cevirir; loglar silinmeden yeniden siralanir, tercih dosyaya kaydedilir."""
        self._log_newest_top = not self._log_newest_top
        self._save_ui_pref()
        try:
            self.query_one("#btn-log-reverse", Button).label = self._reverse_label()
            selected = [i.num for i in self.query(".-selected-line") if isinstance(i, LogLineItem)]
            lv = self.query_one("#main-log-list", ListView)
            entries = list(reversed(self._log_entries)) if self._log_newest_top else list(self._log_entries)
            items = [self._make_log_item(e) for e in entries]
            for it in items:
                if it.num in selected:
                    it.add_class("-selected-line")
            lv.clear()
            lv.extend(items)
            if self._log_newest_top:
                lv.scroll_home(animate=False)
            else:
                lv.scroll_end(animate=False)
        except Exception:
            pass


    # ------------------ F9 Menusu (alt gruplu) ------------------
    def menu_level(self) -> list:
        """Su an gosterilen menu seviyesinin dugumleri."""
        level = PROMAN_MENU
        for index in self.menu_path:
            target = level[index][3]
            level = self._queue_level() if target == "@queue" else target
        return level

    def menu_title(self) -> str:
        parts, level = ["Komut Menusu"], PROMAN_MENU
        for index in self.menu_path:
            parts.append(level[index][1])
            target = level[index][3]
            level = self._queue_level() if target == "@queue" else target
        return " > ".join(parts)

    # ------------------ Komut kuyrugu ------------------
    def queue_count(self) -> int:
        with self._queue_lock:
            return len(self._queue)

    def _queue_level(self) -> list:
        """Kuyruk alt menusu (canli): calisan is, bekleyenler (en son eklenen en ustte), toplu temizleme."""
        level: list = []
        running = self.engine.active_task_name if self.engine.is_task_running else ""
        if running:
            level.append(("▶️", f"Calisan: {running}", "Durdurmak icin x / Esc (kuyruk etkilenmez)", "action_queue_noop"))
        else:
            level.append(("💤", "Calisan is yok", "Kuyruk bos ya da siradaki is baslamak uzere", "action_queue_noop"))
        with self._queue_lock:
            items = list(self._queue)
        for item in reversed(items):
            level.append(("⏳", item["name"], "Enter: bu komutu kuyruktan iptal et", f"@cancel:{item['id']}"))
        if not items:
            level.append(("➖", "Kuyrukta bekleyen komut yok", "", "action_queue_noop"))
        else:
            level.append(("🗑️", "Kuyrugu Temizle (hepsini iptal)", "Sadece bekleyenler silinir; calisan is durmaz", "@clearq"))
        return level

    def action_queue_noop(self) -> None:
        self._reopen_palette()

    def cancel_queued(self, qid: int) -> None:
        with self._queue_lock:
            found = next((q for q in self._queue if q["id"] == qid), None)
            if found:
                self._queue.remove(found)
        if found:
            self.log_message(f"[yellow]🚫 {tg('KUYRUK')} '{escape(found['name'])}' kuyruktan iptal edildi.[/yellow]")
        self._reopen_palette()

    def clear_queue(self, reopen: bool = True) -> int:
        with self._queue_lock:
            n = len(self._queue)
            self._queue.clear()
        if n:
            self.log_message(f"[yellow]🗑️  {tg('KUYRUK')} {n} bekleyen komut iptal edildi.[/yellow]")
        if reopen:
            self._reopen_palette()
        return n

    def _has_pending(self) -> bool:
        with self._queue_lock:
            return bool(self._queue)

    def _open_palette(self) -> None:
        if not CommandPalette.is_open(self):
            self.push_screen(PromanPalette(id="--command-palette"))

    def _reopen_palette(self, tries: int = 20) -> None:
        """Onceki palet kapanirken cagrilir: kapanmasi bitince yenisi acilir. Kapanma gecikirse (yavas makine)
        menu kaybolmasin diye 0.05 sn arayla tekrar denenir (en fazla ~1 sn)."""
        def attempt(left: int) -> None:
            if not CommandPalette.is_open(self):
                self._open_palette()
            elif left > 0:
                self.set_timer(0.05, lambda: attempt(left - 1))

        self.set_timer(0.05, lambda: attempt(tries))

    def action_command_palette(self) -> None:
        """F9: menuyu her zaman ana seviyeden, sag paneldeki log alanina sigdirarak acar."""
        if CommandPalette.is_open(self):
            return
        self.menu_path = []
        self._open_palette()

    def open_submenu(self, index: int) -> None:
        """Bir grup secildi: menu o grubun icerigiyle yeniden acilir."""
        self.menu_path = self.menu_path + [index]
        self._reopen_palette()

    def action_menu_back(self) -> None:
        self.menu_path = self.menu_path[:-1]
        self._reopen_palette()

    def action_ios_info(self) -> None:
        self.log_message(
            f"[cyan]ℹ️  {tg('DERLEME')} iOS derlemesi Windows'ta yapilamaz. Mac'te: apps/mobile icinde `npx expo run:ios` "
            "(Release icin `--configuration Release`).[/cyan]"
        )

    def action_take_screenshot(self) -> None:
        """Terminal penceresinin PNG screenshot'ini global Downloads klasorune kaydeder."""
        # Tusa basildigi anda one cikan pencere = PROMAN'in calistigi terminal
        try:
            hwnd = ctypes.windll.user32.GetForegroundWindow()
        except Exception:
            hwnd = 0
        self._capture_window_png(hwnd)

    @work(thread=True)
    def _capture_window_png(self, hwnd: int) -> None:
        try:
            from PIL import ImageGrab
        except ImportError:
            self.log_message("[red]❌ Screenshot icin Pillow gerekli: pip install pillow[/red]")
            return

        # Palette kapanip ekran yeniden cizilsin
        time.sleep(0.4)
        try:
            try:
                import winreg
                with winreg.OpenKey(winreg.HKEY_CURRENT_USER, r"Software\Microsoft\Windows\CurrentVersion\Explorer\User Shell Folders") as key:
                    out_dir = winreg.QueryValueEx(key, "{374DE290-123F-4565-9164-39C4925E467B}")[0]
                    out_dir = os.path.expandvars(out_dir)
            except Exception:
                out_dir = os.path.join(os.path.expanduser("~"), "Downloads")
                
            os.makedirs(out_dir, exist_ok=True)
            path = os.path.join(out_dir, f"proman_{datetime.now().strftime('%Y%m%d_%H%M%S')}.png")

            bbox = None
            if hwnd:
                try:
                    ctypes.windll.user32.SetThreadDpiAwarenessContext(ctypes.c_void_p(-4))  # PER_MONITOR_AWARE_V2
                except Exception:
                    pass
                rect = ctypes.wintypes.RECT()
                # DWMWA_EXTENDED_FRAME_BOUNDS = 9 -> golgesiz gercek pencere siniri
                res = ctypes.windll.dwmapi.DwmGetWindowAttribute(
                    ctypes.wintypes.HWND(hwnd), 9, ctypes.byref(rect), ctypes.sizeof(rect)
                )
                if res != 0:
                    ctypes.windll.user32.GetWindowRect(ctypes.wintypes.HWND(hwnd), ctypes.byref(rect))
                if rect.right > rect.left and rect.bottom > rect.top:
                    bbox = (rect.left, rect.top, rect.right, rect.bottom)

            img = ImageGrab.grab(bbox=bbox, all_screens=True)
            img.save(path, "PNG")
            self.log_message(f"[bold green]📸 Screenshot kaydedildi:[/bold green] [dim]{path}[/dim]")
        except Exception as e:
            self.log_message(f"[red]❌ Screenshot hatasi: {e}[/red]")

    def compose(self) -> ComposeResult:
        yield Header(show_clock=True)

        with Horizontal(id="main-layout"):
            # SOL PANEL: STATS + TASK PROGRESS + PROCESSLIST
            with Vertical(id="left-column"):
                with Horizontal(id="top-stats-row"):
                    yield HostBox("Project & Host", "box-status")
                    yield SysBox("System Utilization", "box-sys")

                with Vertical(id="op-box"):
                    yield Label("*Live Operation", classes="box-title")
                    yield Label("", id="op-detail", classes="op-line")

                with Vertical(id="process-box"):
                    yield Label("*Processlist (Services)", classes="box-title")
                    yield DataTable(id="table-procs")

            # SAG PANEL: ACTIVITY & STREAM LOG
            with Vertical(id="log-box"):
                with Horizontal(id="log-header"):
                    yield Label("*Activity & Stream Log", classes="box-title", id="log-box-title")
                    yield Button(self._reverse_label(), id="btn-log-reverse", classes="log-tool-btn")
                    yield Button("📋 Kopyala [ y ]", id="btn-log-copy", classes="log-tool-btn")
                    yield Button("🧹 Temizle [ c ]", id="btn-log-clear", classes="log-tool-btn")
                yield ListView(id="main-log-list")

        # BOTTOM COMMAND BUTTON BAR
        with Horizontal(id="command-bar"):
            yield Button("📖 Menu ( F9 )", id="btn-cmd-menu", classes="cmd-btn-menu")
            yield Button("⛔ Abort ( x )", id="btn-cmd-abort", classes="cmd-btn-abort")
            yield Button("🔄 Refresh ( F5 )", id="btn-cmd-refresh", classes="cmd-btn-refresh")
            yield Button("🚪 Quit ( q )", id="btn-cmd-quit", classes="cmd-btn-quit")

    TABLE_COLUMNS = ("SERVICE", "PORT", "PID", "STATE", "CPU", "MEM", "COMMAND")
    TABLE_ROWS = ("api", "web", "mobile", "wsa", "wsa_auto", "esync", "node", "pg", "mssql")

    def on_mount(self) -> None:
        table = self.query_one("#table-procs", DataTable)
        table.cursor_type = "row"  # secim hucre degil, tum satir
        for col in self.TABLE_COLUMNS:
            table.add_column(col, key=col)
        for row in self.TABLE_ROWS:
            table.add_row(*["-"] * len(self.TABLE_COLUMNS), key=row)

        self.log_message(f"[bold cyan]🚀 PROMAN v2.0 Devops Dashboard hazir.[/bold cyan] Kok: [dim]{escape(self.engine.root_dir)}[/dim]")
        if not is_windows_admin():
            self.log_message("[yellow]⚠️  UYARI: Yonetici (Admin) hakki olmadan acildi.[/yellow]")
        else:
            self.log_message("[green]🛡️  Yonetici (Administrator) yetkileri aktif.[/green]")

        self.refresh_all_metrics()
        self.set_interval(2.5, self.refresh_all_metrics)
        self.set_interval(1.0, self._render_op)
        self._render_op()
        self._check_dependencies()

    @work(thread=True)
    def _check_dependencies(self) -> None:
        self.engine.detect_node()
        needed, reason = self.engine.needs_install()
        if needed:
            self.log_message(
                f"[bold yellow]📦 {tg('NPM')} Bagimliliklar eksik / eski: {escape(reason)}. Kurmak icin '9' (NPM Install).[/bold yellow]"
            )

    # ------------------ Metrik ve Log Guncelleme ------------------
    def _on_ui_thread(self) -> bool:
        return getattr(self, "_thread_id", None) == threading.get_ident()

    def log_message(self, message: str) -> None:
        try:
            plain = Content.from_markup(message).plain
        except Exception:
            # Gecersiz markup satiri kaybolmasin: oldugu gibi (kacirilarak) yazilir.
            plain = message
            message = escape(message)
        ts = datetime.now().strftime("%H:%M:%S")
        formatted = f"[dim]{ts}[/dim] {message}"
        clean_raw = f"[{ts}] {ANSI_RE.sub('', plain)}"

        def _write():
            self._log_counter += 1
            entry = (self._log_counter, formatted, clean_raw)
            self._log_entries.append(entry)
            if len(self._log_entries) > 600:
                self._log_entries.pop(0)
            try:
                lv = self.query_one("#main-log-list", ListView)
                if len(lv.children) > 600:
                    lv.children[-1 if self._log_newest_top else 0].remove()
                item = self._make_log_item(entry)
                if self._log_newest_top:
                    lv.insert(0, [item])
                    lv.scroll_home(animate=False)
                else:
                    lv.append(item)
                    lv.scroll_end(animate=False)
            except Exception:
                pass

        if self._on_ui_thread():
            _write()
        else:
            self.call_from_thread(_write)
        self.engine.write_disk_log(plain)

    def _render_op(self) -> None:
        """Calisan isin satirlari (System Utilization kutusunun altinda). Saniyede bir ve her bildirimde cizilir."""
        try:
            state = self._op_state.split(":", 1)[0]
            if "HATA" in state or "IPTAL" in state:
                color = "#ef4444"
            elif "CALISIYOR" in state:
                color = "#00e5ff"
            elif "TAMAMLANDI" in state:
                color = "#22c55e"
            else:
                color = "#64748b"
            idle = state == "IDLE"
            if idle:
                color = "#facc15"

            name =self.engine.active_task_name
            task = f"[bold {color}]{escape(name)}[/]" if name else "[dim]-[/dim]"
            timing = ""
            if self.engine.is_task_running:
                secs = int(time.time() - self.engine.task_started)
                timing = f"Time  : {secs // 60:02d}:{secs % 60:02d}"
                if self._op_info:
                    timing += f"  {escape(self._op_info)}"

            qn = self.queue_count()
            if qn:
                timing += f"  Queue: +{qn}"
            self.query_one("#op-task", Label).update(f"Task  : {task}")
            if idle:
                state_txt = f"[bold {color}]{escape(state)}[/]"
                detail_txt = f"[{color}]{escape(self._op_detail)}[/]"
            else:
                # Islem sirasinda State ve detay kirmizi rozet olarak gorunur
                shown = state
                for tr, en in (
                    ("CALISIYOR", "RUN"),
                    ("IPTAL EDILIYOR", "ABORTING"),
                    ("IPTAL EDILDI", "ABORTED"),
                    ("TAMAMLANDI", "DONE"),
                    ("HATA", "ERROR"),
                ):
                    if tr in state:
                        shown = en
                        break
                state_txt = f"[bold #ffffff on #ef4444] {escape(shown)} [/]"
                detail_txt = f"[#ffffff on #ef4444] {escape(self._op_detail)} [/]"
            self.query_one("#op-state", Label).update(f"State : {state_txt}")
            self.query_one("#op-info", Label).update(timing)
            self.query_one("#op-detail", Label).update(detail_txt)
        except Exception:
            pass

    def update_progress_ui(self, state: str, percent: Optional[float], detail: str, info: str = "") -> None:
        """Motorun is durumu bildirimi: durum (CALISIYOR / IPTAL EDILIYOR / TAMAMLANDI / HATA / IDLE), son cikti satiri
        ve sayac bilgisi. percent kullanilmiyor (yuzde gosterilmiyor)."""
        def _apply():
            self._op_state = state
            self._op_detail = detail
            self._op_info = info
            self._render_op()

        if self._on_ui_thread():
            _apply()
        else:
            self.call_from_thread(_apply)

    def pick_from_thread(self, title: str, options: list[tuple[str, str]]) -> Optional[str]:
        """Is thread'inden cagrilir: secim penceresini acar, kullanici secene / vazgecene kadar bekler.
        Is iptal edilirse (Esc / x) pencere kapatilir ve None doner."""
        done = threading.Event()
        result: dict = {}
        modal = PickModal(title, options)

        def _on_result(value: Optional[str]) -> None:
            result["value"] = value
            done.set()

        self.call_from_thread(lambda: self.push_screen(modal, _on_result))
        while not done.wait(0.2):
            if self.engine.cancelled:
                self.call_from_thread(lambda: modal.is_attached and modal.dismiss(None))
                return None
        return result.get("value")

    def copy_value(self, value: str) -> None:
        if copy_to_windows_clipboard(value):
            self.notify(value, title="📋 Panoya kopyalandi", timeout=2.5)
        else:
            self.notify("Panoya kopyalanamadi", severity="error")

    @work(thread=True)
    def refresh_all_metrics(self) -> None:
        """Sistem, Port, DB ve Surec metriklerini asenkron toplayip TUI'yi besler."""
        if self._refreshing:
            return
        self._refreshing = True
        try:
            self._collect_metrics()
        finally:
            self._refreshing = False

    def _collect_metrics(self) -> None:
        eng = self.engine
        pg_ok = eng.is_db_running()
        ms_ok, ms_port, ms_desc = eng.mssql_status()
        pg_status = "[green]RUNNING[/green]" if pg_ok else "[red]STOPPED[/red]"
        if ms_ok is None:
            ms_status = "[dim]N/A[/dim]"
        else:
            ms_status = "[green]RUNNING[/green]" if ms_ok else "[red]STOPPED[/red]"

        pids = eng.listening_pids([eng.api.port, eng.web.port, eng.mobile.port])
        esync_pid, node_pids = eng.scan_processes()
        esync_tag = "[green]RUNNING[/green]" if esync_pid else "[red]STOPPED[/red]"

        wsa_code, wsa_label = eng.wsa_status()
        auto_code, auto_label = eng.wsa_autostart()
        android_line = wsa_label
        if eng.old_emulator_pids:
            android_line += " [bold red]+ ESKI EMULATOR ACIK[/bold red]"
        version = f" {eng.project_version}" if eng.project_version else ""
        status_txt = (
            f"{'Name':<{HOST_LABEL_W}}: [bold #38bdf8]{escape(eng.project_name)}[/]{escape(version)}\n"
            f"{'Branch':<{HOST_LABEL_W}}: {escape(eng.git_branch())}\n"
            f"{'Host':<{HOST_LABEL_W}}: {escape(socket.gethostname())}\n"
            f"{'Android':<{HOST_LABEL_W}}: {android_line}"
        )
        local_ip = eng.get_lan_ip()
        if ms_ok is None:
            mssql_addr = "(ayar yok)"
        else:
            instance = f"\\{eng.mssql_instance_name}" if eng.mssql_instance_name else ""
            mssql_addr = f"{eng.mssql_host}{instance},{ms_port.lstrip(':')}"
        addresses = {
            "#copy-local-ip": local_ip,
            "#copy-api-url": f"http://{local_ip}:{eng.api_port}",
            # Vite varsayilani sadece localhost'u dinler (vite.config.ts'de server.host yok)
            "#copy-web-url": f"http://localhost:{eng.web.port}",
            "#copy-expo-url": f"exp://{local_ip}:{EXPO_PORT}",
            "#copy-target": eng.get_current_mobile_api_url(),
            "#copy-pg": f"{eng.db_host}:{eng.db_port}",
            "#copy-mssql": mssql_addr,
        }

        cpu_val = psutil.cpu_percent(interval=None)
        mem = psutil.virtual_memory()
        # CPU rengi: varsayilan beyaz, %20 ve ustu mavi, %40 ve ustu kirmizi
        cpu_color = "#ef4444" if cpu_val >= 40 else ("#38bdf8" if cpu_val >= 20 else "#f8fafc")
        bar_len = 8
        filled = min(bar_len, int(round((cpu_val / 100.0) * bar_len)))
        cpu_bar = f"[{cpu_color}]{'█' * filled}[/][#334155]{'░' * (bar_len - filled)}[/]"
        sys_txt = (
            f"CPU   : [bold {cpu_color}]{cpu_val:.1f}%[/] {cpu_bar}\n"
            f"Memory: {mem.percent:.0f}% {mem.used / (1024**3):.1f}/{mem.total / (1024**3):.1f}G\n"
            f"PIDs  : {len(psutil.pids())}"
        )

        rows: dict[str, tuple] = {}
        live: set[int] = set(node_pids)
        for key, name, svc, cmd in (
            ("api", "API", eng.api, "npm run dev"),
            ("web", "Web", eng.web, "npm run dev (Vite)"),
            ("mobile", "Mobil", eng.mobile, "npx expo start"),
        ):
            pid = pids[svc.port][0] if pids[svc.port] else 0
            if not pid:
                state = "[red]STOPPED[/red]"
            elif svc.needs_db and not pg_ok:
                state = "[yellow]RUNNING (DB YOK)[/yellow]"
            else:
                state = "[green]RUNNING[/green]"
            cpu, mem_mb = eng.get_pid_metrics([pid] if pid else [])
            if pid:
                live.add(pid)
            rows[key] = (name, f":{svc.port}", str(pid or "-"), state, cpu, mem_mb, cmd)

        wsa_cpu, wsa_mem = eng.get_pid_metrics([eng.wsa_pid] if eng.wsa_pid else [])
        if eng.wsa_pid:
            live.add(eng.wsa_pid)
        # Tablo durumlari RUNNING / STOPPED; ara durumlar parantezle (API "DB YOK" ile ayni mantik)
        wsa_state = {
            "alive": "[green]RUNNING[/green]",
            "off": "[red]STOPPED[/red]",
            "unauth": "[yellow]RUNNING (ADB IZNI YOK)[/yellow]",
            "noadb": "[yellow]RUNNING (ADB YOK)[/yellow]",
            "dead": "[yellow]RUNNING (ANDROID YANITSIZ)[/yellow]",
        }[wsa_code]
        rows["wsa"] = ("Android (WSA)", f":{WSA_ADB.split(':')[1]}", str(eng.wsa_pid or "-"), wsa_state, wsa_cpu, wsa_mem, f"vmmemWSA, ADB {WSA_ADB}")

        rows["wsa_auto"] = ("WSA - Auto", "-", "-", auto_label, "-", "-", "WSA oturum acilisinda kendiliginden baslar mi (Windows baslangic ayari)")

        es_cpu, es_mem = eng.get_pid_metrics([esync_pid] if esync_pid else [])
        if esync_pid:
            live.add(esync_pid)
        rows["esync"] = ("ESync", "-", str(esync_pid or "-"), esync_tag, es_cpu, es_mem, "ESync.exe (Rust Tray)")

        if eng.node_version is None:
            node_state = "[dim]...[/dim]"
        elif not eng.node_version:
            node_state = "[red]PATH'TE YOK[/red]"
        else:
            node_state = "[green]RUNNING[/green]" if node_pids else "[red]STOPPED[/red]"
        node_cpu, node_mem = eng.get_pid_metrics(node_pids)
        node_cmd = f"node.exe {escape(eng.node_version)} (tum surecler, toplam)" if eng.node_version else "node.exe (tum surecler, toplam)"
        rows["node"] = ("Node.js", "-", f"{len(node_pids)} proc", node_state, node_cpu, node_mem, node_cmd)

        rows["pg"] = ("PostgreSQL", f":{eng.db_port}", "-", pg_status, "-", "-", f"{eng.db_host} (apps/api/.env)")
        rows["mssql"] = ("MSSQL", ms_port, "-", ms_status, "-", "-", ms_desc)
        eng.forget_pids(live)

        def _update():
            try:
                self.query_one("#box-status", StatBox).update_content(status_txt)
                self.query_one("#box-sys", StatBox).update_content(sys_txt)
                for selector, value in addresses.items():
                    self.query_one(selector, CopyLine).set_value(value)
                # Satirlar yerinde guncellenir (tablo silinip yeniden cizilmez: titreme ve imlec sifirlanmasi olmaz)
                tbl = self.query_one("#table-procs", DataTable)
                for row_key, cells in rows.items():
                    for col_key, value in zip(self.TABLE_COLUMNS, cells):
                        tbl.update_cell(row_key, col_key, value, update_width=True)
            except Exception:
                pass

        if self._on_ui_thread():
            _update()
        else:
            self.call_from_thread(_update)

    # ------------------ Eylemler & Klavye / Buton Dinleyicileri ------------------
    def _engine_task(self, name: str, fn) -> None:
        """Isi baslatir; baska is calisiyorsa reddetmez, kuyruga alir (ayni komut zaten kuyruktaysa eklenmez).
        'Calisiyor' isareti burada, tusa basildigi anda (eszamanli) konur; is thread'i sonra baslar.
        Boylece hemen ardindan gelen Esc / x her zaman isi gorur ve iptal eder."""
        start = False
        with self._queue_lock:
            if any(q["name"] == name for q in self._queue):
                dup = True
            else:
                dup = False
                if self.engine.begin_task(name, quiet=True, notify=False):
                    start = True
                else:
                    self._queue_seq += 1
                    self._queue.append({"id": self._queue_seq, "name": name, "fn": fn})
                    pos = len(self._queue)
        if dup:
            self.log_message(f"[yellow]ℹ️  {tg('KUYRUK')} '{escape(name)}' zaten kuyrukta bekliyor.[/yellow]")
        elif start:
            self.engine.notify_started()
            self._execute_engine_task(fn)
        else:
            self.log_message(f"[cyan]📥 {tg('KUYRUK')} '{escape(name)}' siraya alindi (#{pos}).[/cyan]")

    @work(thread=True)
    def _execute_engine_task(self, fn) -> None:
        # Is bitince siradaki otomatik baslar; kuyruk bosalana kadar bu thread dongude kalir.
        while fn is not None:
            self.engine.execute_task(fn, has_pending=self._has_pending)
            fn = None
            with self._queue_lock:
                if self._queue:
                    nxt = self._queue[0]
                    if self.engine.begin_task(nxt["name"], quiet=True, notify=False):
                        self._queue.pop(0)
                        fn = nxt["fn"]
            if fn is not None:
                self.engine.notify_started()
                self.log_message(f"[cyan]▶️  {tg('KUYRUK')} Siradaki komut basliyor: '{escape(self.engine.active_task_name)}'.[/cyan]")
        if not self.engine.is_task_running:
            self.engine.prog("IDLE", 0.0, "Sistem hazir.")
        self.refresh_all_metrics()

    def action_abort_task(self) -> None:
        """x / Abort butonu: calisan isi iptal eder."""
        if self.engine.is_task_running:
            if not self.engine.cancelled:
                self.log_message("[bold yellow]⚠️  Kullanici islemi durdurma istegi gonderdi (Abort)...[/bold yellow]")
            self._abort_worker()
        else:
            self.log_message("[dim]ℹ️  Su an sonlandirilacak aktif bir islem yok.[/dim]")

    @work(thread=True)
    def _abort_worker(self) -> None:
        # taskkill birkac saniye surebilir; UI donmasin diye ayri thread'de.
        self.engine.abort_active_task()

    def action_escape_key(self) -> None:
        """Esc sirasi (her basista tek adim):
        1) Calisan is varsa -> iptal (F9 menusu veya baska pencere acik olsa bile).
        2) Yoksa, acik pencere varsa (F9 menusu, adres, secim, cikis sorusu) -> o kapanir.
           F9 bir alt menudeyse kapanmaz, bir ust menuye doner.
        3) Yoksa -> cikis sorusu."""
        if self.engine.is_task_running:
            self.action_abort_task()
            return
        screen = self.screen
        if isinstance(screen, CommandPalette):
            screen._action_escape()
            if self.menu_path:
                self.action_menu_back()
        elif isinstance(screen, ExitConfirmModal):
            screen.dismiss(False)
        elif isinstance(screen, CustomUrlModal):
            screen.dismiss("")
        elif isinstance(screen, ModalScreen):
            screen.dismiss(None)
        else:
            self.action_confirm_quit()

    @work(thread=True)
    def _hard_exit(self) -> None:
        """Arkaplan islemini sonlandirir ve uygulamadan cikar."""
        with self._queue_lock:
            self._queue.clear()  # cikarken kuyruktaki yeni is baslamasin
        try:
            self.engine.abort_active_task()
        except Exception:
            pass
        self.call_from_thread(self.exit)

    def action_quit(self) -> None:
        """q: calisan is varsa once onu oldurur, sonra cikar (geride derleme sureci kalmasin)."""
        self._hard_exit()

    def action_confirm_quit(self) -> None:
        """Ekranin ortasinda 'cikmak istiyor musun?' penceresi acar."""
        if isinstance(self.screen, ExitConfirmModal):
            return

        def _on_result(confirmed: Optional[bool]) -> None:
            if confirmed:
                self._hard_exit()

        self.push_screen(ExitConfirmModal(), _on_result)

    def on_button_pressed(self, event: Button.Pressed) -> None:
        actions = {
            "btn-cmd-abort": self.action_abort_task,
            "btn-cmd-menu": self.action_command_palette,
            "btn-cmd-refresh": self.action_refresh_status,
            "btn-cmd-quit": self.action_confirm_quit,
            "btn-log-reverse": self.action_toggle_log_order,
            "btn-log-copy": self.action_copy_all_logs,
            "btn-log-clear": self.action_clear_log,
        }
        if event.button.id in actions:
            actions[event.button.id]()

    def action_quick_start(self) -> None:
        self._engine_task("Start System", self.engine.start_system)

    def action_quick_stop(self) -> None:
        self._engine_task("Stop System", self.engine.stop_system)

    def action_toggle_api(self) -> None:
        self._engine_task("API", lambda: self.engine.toggle_service(self.engine.api))

    def action_toggle_web(self) -> None:
        self._engine_task("Web", lambda: self.engine.toggle_service(self.engine.web))

    def _then_qr(self, fn):
        """Mobil'i baslatan isin sonuna QR penceresini ekler (is thread'inde calisir). Expo ayri konsolda acildigi
        icin QR'i PROMAN'da gostermenin yolu budur. Expo ayakta degilse (durduruldu / iptal / hata) pencere acilmaz."""
        def run() -> None:
            eng = self.engine
            fn()
            # Metro'nun portu acmasi start_service'in bekledigi sureden uzun surebilir (soguk acilis): port acilana
            # kadar beklenir. Esc / x beklemeyi keser. Is Mobil'i durdurduysa (process = None) ya da surec
            # kapandiysa beklenmez.
            proc = eng.mobile.process
            if proc is None or proc.poll() is not None or eng.cancelled:
                return
            deadline = time.time() + 90
            while not eng.is_running(eng.mobile):
                if proc.poll() is not None or time.time() > deadline:
                    eng.log(f"[yellow]⚠️  {tg('MOBIL')} Expo hazir olmadi; QR icin hazir olunca 'e' tusuna basin.[/yellow]")
                    return
                eng._step("Expo (Metro) bekleniyor; hazir olunca QR acilacak...")
                if eng.cancel_event.wait(1):
                    return
            self.call_from_thread(self.action_show_qr)

        return run

    def action_show_qr(self) -> None:
        """e: Expo Go ile okutulacak QR kodu."""
        if isinstance(self.screen, QrModal):
            return
        eng = self.engine
        self.push_screen(QrModal(eng.expo_url(), eng.is_running(eng.mobile)))

    def action_toggle_mobile(self) -> None:
        self._engine_task("Mobil", self._then_qr(lambda: self.engine.toggle_service(self.engine.mobile)))

    def action_mobile_start(self) -> None:
        self._engine_task("Mobil", self._then_qr(lambda: self.engine.start_service(self.engine.mobile)))

    def action_mobile_stop(self) -> None:
        self._engine_task("Mobil Durdur", lambda: self.engine.stop_service(self.engine.mobile))

    def action_mobile_clean(self) -> None:
        self._engine_task("Mobil Cache Clear", self._then_qr(self.engine.start_mobile_clean))

    def action_start_tablet(self) -> None:
        self._engine_task("Tablet", self.engine.start_tablet_all)

    def action_start_tablet_app(self) -> None:
        self._engine_task("Tablet App", self.engine.start_tablet_app)

    def action_start_wsa(self) -> None:
        self._engine_task("WSA", self.engine.start_wsa)

    def action_stop_wsa(self) -> None:
        self._engine_task("WSA Kapat", self.engine.stop_wsa)

    def action_wsa_auto_info(self) -> None:
        self._engine_task("WSA Oto-baslangic", self.engine.wsa_autostart_info)

    def action_wsa_auto_off(self) -> None:
        self._engine_task("WSA Oto-baslangic Durdur", lambda: self.engine.wsa_autostart_set(False))

    def action_wsa_auto_on(self) -> None:
        self._engine_task("WSA Oto-baslangic Calistir", lambda: self.engine.wsa_autostart_set(True))

    def action_run_esync(self) -> None:
        self._engine_task("ESync", self.engine.run_esync)

    def action_run_migrations(self) -> None:
        self._engine_task("DB Migration", self.engine.run_migrations)

    def action_run_npm(self) -> None:
        self._engine_task("NPM Install", self.engine.run_npm_install)

    def action_build_apk(self) -> None:
        self._engine_task("Release APK", self.engine.build_android_apk)

    def action_build_debug(self) -> None:
        self._engine_task("Android Debug", lambda: self.engine.build_android(release=False))

    def action_build_release(self) -> None:
        self._engine_task("Android Release", lambda: self.engine.build_android(release=True))

    def action_system_info(self) -> None:
        self._engine_task("Sistem Bilgisi", self.engine.print_system_info)

    def _token_table_task(self, name: str, period: str) -> None:
        """Tablo temiz ekrana basilir: log, is gercekten basladiginda (kuyruktan ciktiginda) temizlenir."""
        def run() -> None:
            self.call_from_thread(self._clear_log_view)
            self.engine.print_token_usage(period)

        self._engine_task(name, run)

    def action_tokens_daily(self) -> None:
        self._token_table_task("Token Gunluk", "daily")

    def action_tokens_weekly(self) -> None:
        self._token_table_task("Token Haftalik", "weekly")

    def action_tokens_monthly(self) -> None:
        self._token_table_task("Token Aylik", "monthly")

    def action_tokens_daily_json(self) -> None:
        self._engine_task("Token Gunluk JSON", lambda: self.engine.print_token_usage("daily", to_json=True))

    def action_tokens_weekly_json(self) -> None:
        self._engine_task("Token Haftalik JSON", lambda: self.engine.print_token_usage("weekly", to_json=True))

    def action_tokens_monthly_json(self) -> None:
        self._engine_task("Token Aylik JSON", lambda: self.engine.print_token_usage("monthly", to_json=True))

    def action_modal_ip(self) -> None:
        def on_ip_done(new_url: Optional[str]) -> None:
            if not new_url:
                return
            if new_url == AUTO_URL or new_url.startswith("http://") or new_url.startswith("https://"):
                if new_url == AUTO_URL:
                    self.engine.set_mobile_api_url(self.engine.lan_url())
                else:
                    self.engine.set_mobile_api_url(new_url.rstrip("/"), manual=True)
                self.log_message(f"[cyan]ℹ️  {tg('TABLET')} Degisikligin gecerli olmasi icin Mobil (Expo) yeniden baslatilmali.[/cyan]")
                self.refresh_all_metrics()
            else:
                self.log_message("[yellow]⚠️  Adres http:// ile baslamalidir.[/yellow]")

        eng = self.engine
        self.push_screen(CustomUrlModal(eng.get_current_mobile_api_url(), eng.is_mobile_api_url_manual(), eng.lan_url()), on_ip_done)

    def action_refresh_status(self) -> None:
        self.log_message("[cyan]🔄 Sistem metrikleri yenileniyor...[/cyan]")
        self.refresh_all_metrics()

    def _clear_log_view(self) -> None:
        """Log ekranini ve sayaci sifirlar (UI thread'inde cagrilir). Diskteki log dosyasina dokunmaz."""
        try:
            self.query_one("#main-log-list", ListView).clear()
            self._log_entries.clear()
            self._log_counter = 0
        except Exception:
            pass

    def action_clear_log(self) -> None:
        self._clear_log_view()
        self.log_message("[dim]Log ekrani temizlendi.[/dim]")

    def select_log_line(self, item: LogLineItem) -> None:
        """Cift tiklanan log satiri: tek secim (onceki secim kalkar) ve satir panoya kopyalanir."""
        try:
            for other in self.query(".-selected-line"):
                other.remove_class("-selected-line")
            item.add_class("-selected-line")
        except Exception:
            pass
        if copy_to_windows_clipboard(item.raw_text):
            self.notify(item.raw_text[:160], title="📋 Satir kopyalandi", timeout=2.5)
        else:
            self.notify("Panoya kopyalanamadi", severity="error")

    def action_copy_all_logs(self) -> None:
        """Kopyala butonu / y: ekrandaki log'un tamamini panoya kopyalar."""
        try:
            lv = self.query_one("#main-log-list", ListView)
            lines = [item.raw_text for item in lv.children if isinstance(item, LogLineItem)]
            if self._log_newest_top:
                lines.reverse()  # panoya her zaman kronolojik (eskiden yeniye) kopyalanir
        except Exception:
            lines = []
        if not lines:
            self.notify("Kopyalanacak log yok", severity="warning")
        elif copy_to_windows_clipboard("\r\n".join(lines)):
            self.notify(f"{len(lines)} satir", title="📋 Log'un tamami kopyalandi", timeout=2.5)
        else:
            self.notify("Panoya kopyalanamadi", severity="error")


def main() -> None:
    PromanApp().run()


if __name__ == "__main__":
    main()

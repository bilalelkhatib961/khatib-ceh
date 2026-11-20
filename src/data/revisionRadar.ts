/*
 * Revision Radar content, imported from the standalone "Khatib CEH | Final Revision" tracker:
 * the 20 CEH v13 chapters, every revision concept (verbatim), priorities, exam reminders,
 * weakest learning objectives and the historical assessment snapshot of 20 Nov 2026.
 *
 * Concept ids are written out literally and are what localStorage stores. Never derive them from
 * array positions and never rename one: a renamed id orphans the saved "revised" tick for it.
 * Concept order mirrors the standalone tracker, whose backups used "<chapter>-<index>" ids;
 * `conceptFromLegacyId` relies on that order only to read those old backup files.
 */

export type RevisionPriority = 'HIGH' | 'FOCUSED' | 'STANDARD';

export interface RevisionConcept {
  id: string;
  text: string;
}

export interface WeakObjective {
  /** Chapter.objective, e.g. "4.4". */
  code: string;
  objective: number;
  name: string;
  /** Original accuracy (%) in the 20 Nov 2026 snapshot. */
  accuracy: number;
}

export interface RevisionChapter {
  /** Stable chapter key, e.g. "ch08". */
  key: string;
  number: number;
  name: string;
  priority: RevisionPriority;
  /** Original accuracy (%) in the 20 Nov 2026 snapshot; live question-bank statistics are preferred when available. */
  snapshotAccuracy: number | null;
  reminder: string;
  weakObjectives: WeakObjective[];
  concepts: RevisionConcept[];
}

/** Exam day (local calendar date). No exam time is known, so none is assumed. */
export const EXAM_DATE = '2026-11-21';

/** Historical results, frozen on 20 Nov 2026. Not current mastery and not a prediction of the exam result. */
export const ASSESSMENT_BASELINE = {
  date: '2026-11-20',
  originalAccuracy: 65.7,
  gradedAttempts: 1328,
  correctAttempts: 873,
  incorrectAttempts: 455,
  chaptersAttempted: 20,
  chaptersTotal: 20,
  objectivesAttempted: 90,
  objectivesTotal: 90,
  uniqueQuestions: 1569,
  unresolvedMockCaptures: 243,
  mocks: [
    { label: 'Mock exam 1', score: 74 },
    { label: 'Mock exam 2', score: 76 },
    { label: 'Mock exam 1 retake', score: 83 },
  ],
} as const;

export const PRIORITY_META: Record<RevisionPriority, { color: string; rank: number; hint: string }> = {
  HIGH: { color: '#FF00A8', rank: 0, hint: 'High priority: lowest original accuracy' },
  FOCUSED: { color: '#FFB800', rank: 1, hint: 'Focused revision chapter' },
  STANDARD: { color: '#00F5FF', rank: 2, hint: 'Standard revision' },
};

/** Revision order from the standalone tracker; tie-breaker for "weakest first" when accuracy is equal or unknown. */
export const PRIORITY_ORDER = [10, 8, 12, 19, 18, 4, 20, 3, 6, 15, 16, 1, 2, 5, 7, 9, 11, 13, 14, 17];

export const REVISION_CHAPTERS: RevisionChapter[] = [
  {
    key: 'ch01',
    number: 1,
    name: 'Introduction to Ethical Hacking',
    priority: 'STANDARD',
    snapshotAccuracy: null,
    reminder: 'Vulnerability = weakness; exploit = method of abusing it.',
    weakObjectives: [],
    concepts: [
      { id: 'ch01-cia-triad-authenticity-non-repudiation', text: 'CIA Triad, authenticity and non-repudiation' },
      { id: 'ch01-threat-vulnerability-exploit-risk', text: 'Threat vs. vulnerability vs. exploit vs. risk' },
      { id: 'ch01-types-hackers-attack-vectors', text: 'Types of hackers and attack vectors' },
      { id: 'ch01-five-phases-ethical-hacking', text: 'Five phases of ethical hacking' },
      { id: 'ch01-information-warfare-classifications', text: 'Information warfare classifications' },
      { id: 'ch01-cyber-kill-chain-mitre-att-ck', text: 'Cyber Kill Chain and MITRE ATT&CK' },
      { id: 'ch01-security-policies-risk-management', text: 'Security policies and risk management' },
      { id: 'ch01-pci-dss-gdpr-hipaa-sox', text: 'PCI DSS, GDPR, HIPAA, SOX' },
    ],
  },
  {
    key: 'ch02',
    number: 2,
    name: 'Footprinting and Reconnaissance',
    priority: 'STANDARD',
    snapshotAccuracy: null,
    reminder: 'Wayback Machine = historical pages; HTTrack = website copying.',
    weakObjectives: [],
    concepts: [
      { id: 'ch02-active-passive-footprinting', text: 'Active vs. passive footprinting' },
      { id: 'ch02-osint-google-hacking-operators', text: 'OSINT and Google hacking operators' },
      { id: 'ch02-whois-dns-footprinting', text: 'WHOIS and DNS footprinting' },
      { id: 'ch02-website-email-footprinting', text: 'Website and email footprinting' },
      { id: 'ch02-social-media-reconnaissance', text: 'Social media reconnaissance' },
      { id: 'ch02-competitive-intelligence', text: 'Competitive intelligence' },
      { id: 'ch02-maltego-shodan-netcraft-theharvester', text: 'Maltego, Shodan, Netcraft, theHarvester' },
      { id: 'ch02-wayback-machine-httrack-dnsdumpster', text: 'Wayback Machine, HTTrack, DNSDumpster' },
    ],
  },
  {
    key: 'ch03',
    number: 3,
    name: 'Scanning Networks',
    priority: 'FOCUSED',
    snapshotAccuracy: null,
    reminder: 'ACK scan identifies filtering; SYN scan is half-open.',
    weakObjectives: [],
    concepts: [
      { id: 'ch03-tcp-three-way-handshake-tcp-flags', text: 'TCP three-way handshake and TCP flags' },
      { id: 'ch03-host-discovery-ping-sweeps', text: 'Host discovery and ping sweeps' },
      { id: 'ch03-tcp-connect-syn-fin-null-xmas-ack-scans', text: 'TCP Connect, SYN, FIN, NULL, Xmas and ACK scans' },
      { id: 'ch03-udp-idle-scanning', text: 'UDP and idle scanning' },
      { id: 'ch03-open-closed-filtered-ports', text: 'Open vs. closed vs. filtered ports' },
      { id: 'ch03-nmap-options-scan-responses', text: 'Nmap options and scan responses' },
      { id: 'ch03-hping3-packet-crafting', text: 'Hping3 and packet crafting' },
      { id: 'ch03-os-fingerprinting-banner-grabbing', text: 'OS fingerprinting and banner grabbing' },
      { id: 'ch03-proxy-chaining-mac-spoofing', text: 'Proxy chaining and MAC spoofing' },
      { id: 'ch03-scanning-countermeasures', text: 'Scanning countermeasures' },
    ],
  },
  {
    key: 'ch04',
    number: 4,
    name: 'Enumeration',
    priority: 'FOCUSED',
    snapshotAccuracy: null,
    reminder: 'NTP = time synchronization; NFS = remote file sharing.',
    weakObjectives: [{ code: '4.4', objective: 4, name: 'NTP and NFS Enumeration', accuracy: 40 }],
    concepts: [
      { id: 'ch04-netbios-enumeration', text: 'NetBIOS enumeration' },
      { id: 'ch04-snmp-community-strings', text: 'SNMP and community strings' },
      { id: 'ch04-ldap-enumeration', text: 'LDAP enumeration' },
      { id: 'ch04-ntp-enumeration-udp-123', text: 'NTP enumeration — UDP 123' },
      { id: 'ch04-nfs-enumeration-port-2049', text: 'NFS enumeration — port 2049' },
      { id: 'ch04-smtp-enumeration-vrfy-expn-rcpt', text: 'SMTP enumeration — VRFY, EXPN, RCPT TO' },
      { id: 'ch04-dns-zone-transfer-axfr', text: 'DNS zone transfer (AXFR)' },
      { id: 'ch04-smb-rpc-ipsec-bgp-enumeration', text: 'SMB, RPC, IPsec and BGP enumeration' },
      { id: 'ch04-enum4linux-snmpwalk-ldapsearch-showmount', text: 'enum4linux, snmpwalk, ldapsearch, showmount, ntpq' },
    ],
  },
  {
    key: 'ch05',
    number: 5,
    name: 'Vulnerability Analysis',
    priority: 'STANDARD',
    snapshotAccuracy: null,
    reminder: 'CVE identifies a vulnerability; CVSS measures severity; CWE categorizes weaknesses.',
    weakObjectives: [],
    concepts: [
      { id: 'ch05-vulnerability-assessment-lifecycle', text: 'Vulnerability assessment lifecycle' },
      { id: 'ch05-active-passive-assessments', text: 'Active vs. passive assessments' },
      { id: 'ch05-internal-external-assessments', text: 'Internal vs. external assessments' },
      { id: 'ch05-credentialed-non-credentialed-scanning', text: 'Credentialed vs. non-credentialed scanning' },
      { id: 'ch05-cve-cvss-cwe-nvd', text: 'CVE, CVSS, CWE and NVD' },
      { id: 'ch05-false-positives-false-negatives', text: 'False positives and false negatives' },
      { id: 'ch05-nessus-openvas-qualys', text: 'Nessus, OpenVAS and Qualys' },
      { id: 'ch05-vulnerability-prioritization-remediation', text: 'Vulnerability prioritization and remediation' },
    ],
  },
  {
    key: 'ch06',
    number: 6,
    name: 'System Hacking',
    priority: 'FOCUSED',
    snapshotAccuracy: null,
    reminder: 'Steganography hides existence; encryption hides meaning.',
    weakObjectives: [],
    concepts: [
      { id: 'ch06-online-offline-password-attacks', text: 'Online vs. offline password attacks' },
      { id: 'ch06-dictionary-brute-force-hybrid-rainbow-table', text: 'Dictionary, brute-force, hybrid and rainbow table attacks' },
      { id: 'ch06-password-salting-hashing', text: 'Password salting and hashing' },
      { id: 'ch06-lm-ntlm-kerberos', text: 'LM, NTLM and Kerberos' },
      { id: 'ch06-horizontal-vertical-privilege-escalation', text: 'Horizontal vs. vertical privilege escalation' },
      { id: 'ch06-pass-hash-pass-ticket', text: 'Pass-the-hash and pass-the-ticket' },
      { id: 'ch06-maintaining-access-persistence', text: 'Maintaining access and persistence' },
      { id: 'ch06-steganography-steganalysis', text: 'Steganography and steganalysis' },
      { id: 'ch06-covering-tracks-log-manipulation', text: 'Covering tracks and log manipulation' },
      { id: 'ch06-john-ripper-hashcat-hydra-metasploit', text: 'John the Ripper, Hashcat, Hydra, Metasploit' },
    ],
  },
  {
    key: 'ch07',
    number: 7,
    name: 'Malware Threats',
    priority: 'STANDARD',
    snapshotAccuracy: null,
    reminder: 'Polymorphic malware changes representation; metamorphic malware rewrites code.',
    weakObjectives: [],
    concepts: [
      { id: 'ch07-virus-worm-trojan', text: 'Virus vs. worm vs. Trojan' },
      { id: 'ch07-rootkits-spyware-ransomware-keyloggers', text: 'Rootkits, spyware, ransomware and keyloggers' },
      { id: 'ch07-fileless-malware-apts', text: 'Fileless malware and APTs' },
      { id: 'ch07-polymorphic-metamorphic-malware', text: 'Polymorphic vs. metamorphic malware' },
      { id: 'ch07-logic-bombs-backdoors', text: 'Logic bombs and backdoors' },
      { id: 'ch07-malware-delivery-propagation', text: 'Malware delivery and propagation' },
      { id: 'ch07-static-dynamic-malware-analysis', text: 'Static vs. dynamic malware analysis' },
      { id: 'ch07-sandboxing-indicators-compromise', text: 'Sandboxing, indicators of compromise' },
      { id: 'ch07-virustotal-peid-process-monitor-strings', text: 'VirusTotal, PEiD, Process Monitor, strings' },
    ],
  },
  {
    key: 'ch08',
    number: 8,
    name: 'Sniffing',
    priority: 'HIGH',
    snapshotAccuracy: 56,
    reminder: 'MAC flooding targets the switch table; ARP poisoning targets IP-to-MAC mappings.',
    weakObjectives: [{ code: '8.2', objective: 2, name: 'Sniffing Techniques', accuracy: 47 }],
    concepts: [
      { id: 'ch08-active-passive-sniffing', text: 'Active vs. passive sniffing' },
      { id: 'ch08-promiscuous-mode-detection', text: 'Promiscuous mode and its detection' },
      { id: 'ch08-mac-flooding-cam-table-overflow', text: 'MAC flooding and CAM table overflow' },
      { id: 'ch08-mac-spoofing-arp-spoofing', text: 'MAC spoofing vs. ARP spoofing' },
      { id: 'ch08-arp-poisoning-mitm', text: 'ARP poisoning and MITM' },
      { id: 'ch08-dhcp-starvation-rogue-dhcp', text: 'DHCP starvation vs. rogue DHCP' },
      { id: 'ch08-dns-poisoning-spoofing', text: 'DNS poisoning and spoofing' },
      { id: 'ch08-switch-port-stealing', text: 'Switch port stealing' },
      { id: 'ch08-wireshark-tcpdump-ettercap-bettercap', text: 'Wireshark, tcpdump, Ettercap, Bettercap' },
      { id: 'ch08-dhcp-snooping-dynamic-arp-inspection-port', text: 'DHCP snooping, Dynamic ARP Inspection and port security' },
    ],
  },
  {
    key: 'ch09',
    number: 9,
    name: 'Social Engineering',
    priority: 'STANDARD',
    snapshotAccuracy: null,
    reminder: 'Whaling targets executives; spear phishing targets specific individuals.',
    weakObjectives: [],
    concepts: [
      { id: 'ch09-human-based-computer-based-mobile-based', text: 'Human-based, computer-based and mobile-based attacks' },
      { id: 'ch09-phishing-spear-phishing-whaling', text: 'Phishing, spear phishing and whaling' },
      { id: 'ch09-smishing-vishing-voice-cloning', text: 'Smishing, vishing and voice cloning' },
      { id: 'ch09-pretexting-impersonation-baiting', text: 'Pretexting, impersonation and baiting' },
      { id: 'ch09-tailgating-piggybacking', text: 'Tailgating and piggybacking' },
      { id: 'ch09-dumpster-diving-shoulder-surfing', text: 'Dumpster diving and shoulder surfing' },
      { id: 'ch09-watering-hole-attacks', text: 'Watering-hole attacks' },
      { id: 'ch09-identity-theft-insider-threats', text: 'Identity theft and insider threats' },
      { id: 'ch09-social-engineer-toolkit-set', text: 'Social-Engineer Toolkit (SET)' },
      { id: 'ch09-awareness-training-verification-procedures', text: 'Awareness training and verification procedures' },
    ],
  },
  {
    key: 'ch10',
    number: 10,
    name: 'Denial-of-Service',
    priority: 'HIGH',
    snapshotAccuracy: 53,
    reminder: 'Smurf uses ICMP; Fraggle uses UDP; Slowloris holds HTTP connections open.',
    weakObjectives: [{ code: '10.2', objective: 2, name: 'DoS and DDoS Attack Techniques', accuracy: 42 }],
    concepts: [
      { id: 'ch10-dos-ddos-drdos', text: 'DoS vs. DDoS vs. DRDoS' },
      { id: 'ch10-volumetric-protocol-application-layer', text: 'Volumetric, protocol and application-layer attacks' },
      { id: 'ch10-syn-udp-icmp-http-floods', text: 'SYN, UDP, ICMP and HTTP floods' },
      { id: 'ch10-smurf-fraggle-attacks', text: 'Smurf vs. Fraggle attacks' },
      { id: 'ch10-ping-death-teardrop-land-attacks', text: 'Ping of Death, Teardrop and LAND attacks' },
      { id: 'ch10-slowloris-slow-http-attacks', text: 'Slowloris and slow HTTP attacks' },
      { id: 'ch10-reflection-amplification-attacks', text: 'Reflection and amplification attacks' },
      { id: 'ch10-botnets-command-control', text: 'Botnets and command-and-control' },
      { id: 'ch10-loic-hoic-hping3-slowloris', text: 'LOIC, HOIC, Hping3, Slowloris' },
      { id: 'ch10-rate-limiting-syn-cookies-filtering-cdn', text: 'Rate limiting, SYN cookies, filtering, CDN and scrubbing' },
    ],
  },
  {
    key: 'ch11',
    number: 11,
    name: 'Session Hijacking',
    priority: 'STANDARD',
    snapshotAccuracy: null,
    reminder: 'Session fixation sets a known session ID before authentication.',
    weakObjectives: [],
    concepts: [
      { id: 'ch11-active-passive-session-hijacking', text: 'Active vs. passive session hijacking' },
      { id: 'ch11-network-level-application-level-hijacking', text: 'Network-level vs. application-level hijacking' },
      { id: 'ch11-session-fixation-session-prediction', text: 'Session fixation vs. session prediction' },
      { id: 'ch11-tcp-session-hijacking', text: 'TCP session hijacking' },
      { id: 'ch11-session-sniffing-sidejacking', text: 'Session sniffing and sidejacking' },
      { id: 'ch11-cookie-theft-replay-attacks', text: 'Cookie theft and replay attacks' },
      { id: 'ch11-mitm-attacks', text: 'MITM attacks' },
      { id: 'ch11-secure-httponly-samesite-cookies', text: 'Secure, HttpOnly and SameSite cookies' },
      { id: 'ch11-tls-session-regeneration-expiration', text: 'TLS, session regeneration and expiration' },
    ],
  },
  {
    key: 'ch12',
    number: 12,
    name: 'Evading IDS, Firewalls and Honeypots',
    priority: 'HIGH',
    snapshotAccuracy: 58,
    reminder: 'Ingress checks incoming traffic; egress checks outgoing traffic.',
    weakObjectives: [],
    concepts: [
      { id: 'ch12-ids-ips', text: 'IDS vs. IPS' },
      { id: 'ch12-hids-nids', text: 'HIDS vs. NIDS' },
      { id: 'ch12-signature-anomaly-stateful-protocol', text: 'Signature vs. anomaly vs. stateful protocol detection' },
      { id: 'ch12-true-false-positives-negatives', text: 'True/false positives and negatives' },
      { id: 'ch12-packet-filtering-stateful-proxy-firewalls', text: 'Packet filtering, stateful and proxy firewalls' },
      { id: 'ch12-circuit-level-application-level-gateways', text: 'Circuit-level vs. application-level gateways' },
      { id: 'ch12-ingress-egress-filtering', text: 'Ingress vs. egress filtering' },
      { id: 'ch12-fragmentation-insertion-evasion-obfuscation', text: 'Fragmentation, insertion, evasion and obfuscation' },
      { id: 'ch12-tunneling-spoofing-concepts', text: 'Tunneling and spoofing concepts' },
      { id: 'ch12-low-medium-high-interaction-honeypots', text: 'Low, medium and high-interaction honeypots' },
      { id: 'ch12-production-research-honeypots', text: 'Production vs. research honeypots' },
      { id: 'ch12-snort-suricata-firewall-countermeasures', text: 'Snort, Suricata and firewall countermeasures' },
    ],
  },
  {
    key: 'ch13',
    number: 13,
    name: 'Hacking Web Servers',
    priority: 'STANDARD',
    snapshotAccuracy: null,
    reminder: 'Directory traversal accesses files outside the intended directory.',
    weakObjectives: [],
    concepts: [
      { id: 'ch13-web-server-architecture-http-methods', text: 'Web server architecture and HTTP methods' },
      { id: 'ch13-server-misconfiguration', text: 'Server misconfiguration' },
      { id: 'ch13-directory-traversal', text: 'Directory traversal' },
      { id: 'ch13-http-request-smuggling-response-splitting', text: 'HTTP request smuggling and response splitting' },
      { id: 'ch13-web-cache-poisoning', text: 'Web cache poisoning' },
      { id: 'ch13-http-parameter-pollution', text: 'HTTP parameter pollution' },
      { id: 'ch13-website-defacement', text: 'Website defacement' },
      { id: 'ch13-web-server-fingerprinting', text: 'Web server fingerprinting' },
      { id: 'ch13-nikto-nmap-netcat-burp-suite', text: 'Nikto, Nmap, Netcat and Burp Suite' },
      { id: 'ch13-server-hardening-patching', text: 'Server hardening and patching' },
    ],
  },
  {
    key: 'ch14',
    number: 14,
    name: 'Hacking Web Applications',
    priority: 'STANDARD',
    snapshotAccuracy: null,
    reminder: 'XSS executes browser scripts; CSRF abuses user sessions; SSRF abuses server-side requests.',
    weakObjectives: [],
    concepts: [
      { id: 'ch14-owasp-top-10-concepts', text: 'OWASP Top 10 concepts' },
      { id: 'ch14-stored-reflected-dom-based-xss', text: 'Stored, reflected and DOM-based XSS' },
      { id: 'ch14-csrf-ssrf', text: 'CSRF vs. SSRF' },
      { id: 'ch14-idor-broken-access-control', text: 'IDOR and broken access control' },
      { id: 'ch14-local-remote-file-inclusion', text: 'Local vs. remote file inclusion' },
      { id: 'ch14-command-injection-template-injection', text: 'Command injection and template injection' },
      { id: 'ch14-authentication-authorization-weaknesses', text: 'Authentication and authorization weaknesses' },
      { id: 'ch14-xml-external-entity-attacks-xxe', text: 'XML External Entity attacks (XXE)' },
      { id: 'ch14-insecure-deserialization', text: 'Insecure deserialization' },
      { id: 'ch14-api-security-jwt-weaknesses', text: 'API security and JWT weaknesses' },
      { id: 'ch14-burp-suite-owasp-zap-wafs', text: 'Burp Suite, OWASP ZAP and WAFs' },
    ],
  },
  {
    key: 'ch15',
    number: 15,
    name: 'SQL Injection',
    priority: 'FOCUSED',
    snapshotAccuracy: null,
    reminder: 'Blind SQL injection infers results without directly displaying extracted data.',
    weakObjectives: [],
    concepts: [
      { id: 'ch15-in-band-inferential-out-band-sql-injection', text: 'In-band, inferential and out-of-band SQL injection' },
      { id: 'ch15-union-based-error-based-sql-injection', text: 'UNION-based vs. error-based SQL injection' },
      { id: 'ch15-boolean-based-time-based-blind-sql-injection', text: 'Boolean-based vs. time-based blind SQL injection' },
      { id: 'ch15-tautologies-logically-incorrect-queries', text: 'Tautologies and logically incorrect queries' },
      { id: 'ch15-piggybacked-queries', text: 'Piggybacked queries' },
      { id: 'ch15-database-table-column-enumeration', text: 'Database, table and column enumeration' },
      { id: 'ch15-information-schema-database-metadata', text: 'INFORMATION_SCHEMA and database metadata' },
      { id: 'ch15-stored-procedure-second-order-injection', text: 'Stored procedure and second-order injection' },
      { id: 'ch15-sqlmap-database-fingerprinting', text: 'sqlmap and database fingerprinting' },
      { id: 'ch15-parameterized-queries-least-privilege', text: 'Parameterized queries and least privilege' },
    ],
  },
  {
    key: 'ch16',
    number: 16,
    name: 'Hacking Wireless Networks',
    priority: 'FOCUSED',
    snapshotAccuracy: null,
    reminder: 'Bluejacking sends messages; bluesnarfing steals data; bluebugging gains control.',
    weakObjectives: [],
    concepts: [
      { id: 'ch16-ieee-802-11-standards-frequency-bands', text: 'IEEE 802.11 standards and frequency bands' },
      { id: 'ch16-wep-wpa-wpa2-wpa3', text: 'WEP, WPA, WPA2 and WPA3' },
      { id: 'ch16-tkip-ccmp-aes', text: 'TKIP, CCMP and AES' },
      { id: 'ch16-personal-enterprise-authentication', text: 'Personal vs. Enterprise authentication' },
      { id: 'ch16-802-1x-eap-radius', text: '802.1X, EAP and RADIUS' },
      { id: 'ch16-rogue-ap-evil-twin', text: 'Rogue AP vs. evil twin' },
      { id: 'ch16-deauthentication-disassociation', text: 'Deauthentication and disassociation' },
      { id: 'ch16-krack-wps-attacks-wardriving', text: 'KRACK, WPS attacks and wardriving' },
      { id: 'ch16-bluetooth-bluejacking-bluesnarfing', text: 'Bluetooth: bluejacking, bluesnarfing, bluebugging' },
      { id: 'ch16-aircrack-ng-kismet-reaver-wifite', text: 'Aircrack-ng, Kismet, Reaver, Wifite' },
    ],
  },
  {
    key: 'ch17',
    number: 17,
    name: 'Hacking Mobile Platforms',
    priority: 'STANDARD',
    snapshotAccuracy: null,
    reminder: 'Rooting is associated with Android; jailbreaking with iOS.',
    weakObjectives: [],
    concepts: [
      { id: 'ch17-android-ios-security-models', text: 'Android and iOS security models' },
      { id: 'ch17-rooting-jailbreaking', text: 'Rooting vs. jailbreaking' },
      { id: 'ch17-android-permissions-apk-files', text: 'Android permissions and APK files' },
      { id: 'ch17-mobile-malware-malicious-applications', text: 'Mobile malware and malicious applications' },
      { id: 'ch17-app-repackaging-reverse-engineering', text: 'App repackaging and reverse engineering' },
      { id: 'ch17-insecure-local-storage-communications', text: 'Insecure local storage and communications' },
      { id: 'ch17-mobile-application-sandboxing', text: 'Mobile application sandboxing' },
      { id: 'ch17-adb-mobsf-jadx-apktool-frida', text: 'ADB, MobSF, JADX, APKTool, Frida' },
      { id: 'ch17-mdm-mobile-security-countermeasures', text: 'MDM and mobile security countermeasures' },
    ],
  },
  {
    key: 'ch18',
    number: 18,
    name: 'IoT and OT Hacking',
    priority: 'HIGH',
    snapshotAccuracy: 60,
    reminder: 'PLC controls processes; RTU collects remote telemetry; HMI provides an operator interface.',
    weakObjectives: [{ code: '18.5', objective: 5, name: 'OT Hacking Methodology', accuracy: 40 }],
    concepts: [
      { id: 'ch18-iot-architecture-attack-surfaces', text: 'IoT architecture and attack surfaces' },
      { id: 'ch18-mqtt-coap-zigbee-bluetooth-low-energy', text: 'MQTT, CoAP, Zigbee and Bluetooth Low Energy' },
      { id: 'ch18-default-credentials-insecure-firmware', text: 'Default credentials and insecure firmware' },
      { id: 'ch18-iot-botnets-mirai', text: 'IoT botnets such as Mirai' },
      { id: 'ch18-ics-scada-dcs', text: 'ICS, SCADA and DCS' },
      { id: 'ch18-plc-rtu-hmi-sensors', text: 'PLC, RTU, HMI and sensors' },
      { id: 'ch18-modbus-dnp3-industrial-protocols', text: 'Modbus, DNP3 and industrial protocols' },
      { id: 'ch18-purdue-model-network-segmentation', text: 'Purdue Model and network segmentation' },
      { id: 'ch18-ot-hacking-methodology-reconnaissance', text: 'OT hacking methodology and reconnaissance' },
      { id: 'ch18-shodan-industrial-device-discovery', text: 'Shodan and industrial device discovery' },
      { id: 'ch18-safety-availability-ot-countermeasures', text: 'Safety, availability and OT countermeasures' },
    ],
  },
  {
    key: 'ch19',
    number: 19,
    name: 'Cloud Computing',
    priority: 'HIGH',
    snapshotAccuracy: 57,
    reminder: 'IaaS gives customers more infrastructure control than SaaS.',
    weakObjectives: [{ code: '19.1', objective: 1, name: 'Cloud Computing Concepts', accuracy: 48 }],
    concepts: [
      { id: 'ch19-iaas-paas-saas', text: 'IaaS, PaaS and SaaS' },
      { id: 'ch19-public-private-hybrid-community-cloud', text: 'Public, private, hybrid and community cloud' },
      { id: 'ch19-shared-responsibility-model', text: 'Shared responsibility model' },
      { id: 'ch19-virtualization-hypervisor-types', text: 'Virtualization and hypervisor types' },
      { id: 'ch19-containers-docker-kubernetes', text: 'Containers, Docker and Kubernetes' },
      { id: 'ch19-serverless-computing', text: 'Serverless computing' },
      { id: 'ch19-iam-roles-excessive-permissions', text: 'IAM, roles and excessive permissions' },
      { id: 'ch19-cloud-storage-misconfiguration', text: 'Cloud storage misconfiguration' },
      { id: 'ch19-metadata-services-ssrf-risks', text: 'Metadata services and SSRF risks' },
      { id: 'ch19-cloud-account-hijacking-cryptojacking', text: 'Cloud account hijacking and cryptojacking' },
      { id: 'ch19-vm-escape-container-escape', text: 'VM escape and container escape' },
      { id: 'ch19-cloud-security-controls-monitoring', text: 'Cloud security controls and monitoring' },
    ],
  },
  {
    key: 'ch20',
    number: 20,
    name: 'Cryptography',
    priority: 'FOCUSED',
    snapshotAccuracy: null,
    reminder: 'Encrypt for the recipient using their public key; sign using the sender’s private key.',
    weakObjectives: [],
    concepts: [
      { id: 'ch20-symmetric-asymmetric-encryption', text: 'Symmetric vs. asymmetric encryption' },
      { id: 'ch20-aes-des-3des-rc4-blowfish', text: 'AES, DES, 3DES, RC4 and Blowfish' },
      { id: 'ch20-rsa-ecc-diffie-hellman', text: 'RSA, ECC and Diffie-Hellman' },
      { id: 'ch20-md5-sha-families-hashing', text: 'MD5, SHA families and hashing' },
      { id: 'ch20-hmac-mac-digital-signatures', text: 'HMAC, MAC and digital signatures' },
      { id: 'ch20-pki-ca-ra-certificates-crl-ocsp', text: 'PKI: CA, RA, certificates, CRL and OCSP' },
      { id: 'ch20-tls-certificate-validation', text: 'TLS and certificate validation' },
      { id: 'ch20-block-stream-ciphers', text: 'Block vs. stream ciphers' },
      { id: 'ch20-ecb-cbc-ctr-gcm-modes', text: 'ECB, CBC, CTR and GCM modes' },
      { id: 'ch20-birthday-collision-rainbow-table-attacks', text: 'Birthday, collision and rainbow table attacks' },
      { id: 'ch20-known-plaintext-chosen-plaintext-attacks', text: 'Known-plaintext and chosen-plaintext attacks' },
      { id: 'ch20-rubber-hose-attack-cryptanalysis', text: 'Rubber-hose attack and cryptanalysis' },
      { id: 'ch20-pgp-s-mime-disk-encryption', text: 'PGP, S/MIME and disk encryption' },
    ],
  },
];

export const ALL_CONCEPTS: RevisionConcept[] = REVISION_CHAPTERS.flatMap((c) => c.concepts);
export const CONCEPT_IDS: ReadonlySet<string> = new Set(ALL_CONCEPTS.map((c) => c.id));
export const TOTAL_CONCEPTS = ALL_CONCEPTS.length;

/** Maps an id from a standalone-tracker backup ("10-3" = chapter 10, 4th concept) to the stable id. */
export function conceptFromLegacyId(legacy: string): string | null {
  const m = /^(\d{1,2})-(\d{1,2})$/.exec(legacy);
  if (!m) return null;
  return REVISION_CHAPTERS.find((c) => c.number === Number(m[1]))?.concepts[Number(m[2])]?.id ?? null;
}

if (import.meta.env.DEV && CONCEPT_IDS.size !== TOTAL_CONCEPTS) console.error('Revision Radar: duplicate concept ids');

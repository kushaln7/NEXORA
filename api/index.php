<?php
/* ═══════════════════════════════════════════════════════
   CANONIX — PHP API Router
   Replaces Node.js/Express backend for shared hosting
   Handles: Auth, Content CRUD, HTML Update Engine
═══════════════════════════════════════════════════════ */

require_once __DIR__ . '/config.php';

// ─── Session ────────────────────────────────────────
session_name('canonix_session');
session_set_cookie_params([
    'lifetime' => 4 * 60 * 60, // 4 hours
    'path'     => '/',
    'httponly'  => true,
    'secure'   => (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off'),
    'samesite' => 'Lax'
]);
session_start();

// ─── CORS & Headers ─────────────────────────────────
header('Content-Type: application/json; charset=utf-8');

// ─── Parse Request ──────────────────────────────────
$method  = $_SERVER['REQUEST_METHOD'];
$route   = $_GET['route'] ?? '';
$section = $_GET['section'] ?? '';

$body = null;
if (in_array($method, ['POST', 'PUT'])) {
    $raw = file_get_contents('php://input');
    $body = json_decode($raw, true);
}

// ─── Helpers ────────────────────────────────────────
function jsonResponse($data, $code = 200) {
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function requireAuth() {
    if (empty($_SESSION['authenticated'])) {
        jsonResponse(['error' => 'Unauthorized'], 401);
    }
}

// ─── Router ─────────────────────────────────────────
switch (true) {

    // ── Auth ──
    case $route === 'auth/check' && $method === 'GET':
        jsonResponse(['authenticated' => !empty($_SESSION['authenticated'])]);
        break;

    case $route === 'auth/login' && $method === 'POST':
        authLogin($body);
        break;

    case $route === 'auth/logout' && $method === 'POST':
        $_SESSION = [];
        session_destroy();
        jsonResponse(['success' => true]);
        break;

    case $route === 'auth/password' && $method === 'PUT':
        requireAuth();
        changePassword($body);
        break;

    // ── Content ──
    case $route === 'content' && $method === 'GET' && $section === '':
        requireAuth();
        getAllContent();
        break;

    case $route === 'content' && $method === 'PUT' && $section !== '':
        requireAuth();
        updateContent($section, $body);
        break;

    // Public content (no auth — website content is public data)
    case $route === 'content-public' && $method === 'GET':
        getPublicContent();
        break;

    // Debug: check file paths and write permissions (remove after fixing)
    case $route === 'debug' && $method === 'GET':
        requireAuth();
        $root = SITE_ROOT;
        $files = ['index.html','blog.html','rnd.html'];
        $report = ['site_root' => $root, 'files' => []];
        foreach ($files as $f) {
            $p = $root . '/' . $f;
            $report['files'][$f] = [
                'exists'   => file_exists($p),
                'writable' => is_writable($p),
                'path'     => $p,
                'perms'    => file_exists($p) ? substr(sprintf('%o', fileperms($p)), -4) : 'n/a',
            ];
        }
        jsonResponse($report);
        break;

    default:
        jsonResponse(['error' => 'Not found'], 404);
}

/* ═══════════════════════════════════════════════════════
   AUTH FUNCTIONS
═══════════════════════════════════════════════════════ */

function authLogin($body) {
    $username = $body['username'] ?? '';
    $password = $body['password'] ?? '';

    try {
        $db = getDB();
        $stmt = $db->prepare("SELECT password_hash FROM admin_users WHERE username = ? LIMIT 1");
        $stmt->execute([$username]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);

        if ($row && password_verify($password, $row['password_hash'])) {
            $_SESSION['authenticated'] = true;
            jsonResponse(['success' => true]);
        }
        jsonResponse(['error' => 'Invalid credentials'], 401);
    } catch (Exception $e) {
        jsonResponse(['error' => 'Server error'], 500);
    }
}

function changePassword($body) {
    $currentPw = $body['currentPassword'] ?? '';
    $newPw     = $body['newPassword'] ?? '';

    if (!$newPw || strlen($newPw) < 6) {
        jsonResponse(['error' => 'Password must be at least 6 characters'], 400);
    }

    try {
        $db = getDB();
        $stmt = $db->prepare("SELECT id, password_hash FROM admin_users LIMIT 1");
        $stmt->execute();
        $admin = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$admin || !password_verify($currentPw, $admin['password_hash'])) {
            jsonResponse(['error' => 'Current password is incorrect'], 400);
        }

        $newHash = password_hash($newPw, PASSWORD_BCRYPT);
        $upd = $db->prepare("UPDATE admin_users SET password_hash = ? WHERE id = ?");
        $upd->execute([$newHash, $admin['id']]);

        jsonResponse(['success' => true]);
    } catch (Exception $e) {
        jsonResponse(['error' => 'Server error'], 500);
    }
}

/* ═══════════════════════════════════════════════════════
   CONTENT FUNCTIONS
═══════════════════════════════════════════════════════ */

function getAllContent() {
    try {
        $db = getDB();
        $rows = $db->query("SELECT section, data FROM content")->fetchAll(PDO::FETCH_ASSOC);
        $result = [];
        foreach ($rows as $row) {
            $result[$row['section']] = json_decode($row['data'], true);
        }
        // Add timestamp
        $ts = $db->query("SELECT MAX(updated_at) as ts FROM content")->fetch(PDO::FETCH_ASSOC);
        if ($ts && $ts['ts']) {
            $result['_lastModified'] = date('c', strtotime($ts['ts']));
        }
        jsonResponse($result);
    } catch (Exception $e) {
        jsonResponse(['error' => 'Failed to read content'], 500);
    }
}

// Same as getAllContent but no auth — safe because this is all public website copy
function getPublicContent() {
    try {
        $db = getDB();
        $rows = $db->query("SELECT section, data FROM content")->fetchAll(PDO::FETCH_ASSOC);
        $result = [];
        foreach ($rows as $row) {
            $result[$row['section']] = json_decode($row['data'], true);
        }
        // Never cache — always serve fresh DB data
        header('Cache-Control: no-store, no-cache, must-revalidate');
        header('Pragma: no-cache');
        jsonResponse($result);
    } catch (Exception $e) {
        jsonResponse(['error' => 'Failed to read content'], 500);
    }
}

function updateContent($section, $data) {
    if (!$data) {
        jsonResponse(['error' => 'No data provided'], 400);
    }

    try {
        $db = getDB();
        $json = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

        // Upsert: update if exists, insert if not
        $stmt = $db->prepare("INSERT INTO content (section, data) VALUES (?, ?)
                              ON DUPLICATE KEY UPDATE data = VALUES(data), updated_at = NOW()");
        $stmt->execute([$section, $json]);

        $timestamp = date('c');

        // Update the static HTML files
        $htmlError = null;
        try {
            updateHTML($section, $data);
        } catch (\Exception $e) {
            $htmlError = $e->getMessage();
            error_log('Canonix HTML update error: ' . $htmlError);
        }

        $resp = ['success' => true, 'timestamp' => $timestamp];
        if ($htmlError) $resp['html_warning'] = $htmlError;
        jsonResponse($resp);
    } catch (Exception $e) {
        error_log('Canonix save error: ' . $e->getMessage());
        jsonResponse(['error' => $e->getMessage() ?: 'Failed to save'], 500);
    }
}

/* ═══════════════════════════════════════════════════════
   HTML UPDATE ENGINE
   Ports the Cheerio-based Node.js HTML updater to PHP
   Uses DOMDocument + DOMXPath for element selection
═══════════════════════════════════════════════════════ */

function updateHTML($section, $data) {
    try {
        switch ($section) {
            case 'home':       updateHomeHTML($data); break;
            case 'settings':   updateSettingsHTML($data); break;
            case 'blog':       updateBlogHTML($data); break;
            case 'rnd':        updateRndHTML($data); break;
            case 'projex':     updateSuitePageHTML('projex.html', $data); break;
            case 'techvyuha':  updateSuitePageHTML('projex.html', $data); break;
            case 'nexora':     updateSuitePageHTML('nexora-digital.html', $data); break;
            case 'aetherai':   updateSuitePageHTML('aetherai.html', $data); break;
        }
    } catch (Exception $e) {
        error_log('HTML update error: ' . $e->getMessage());
    }
}

// ── DOM Helpers ─────────────────────────────────────

/**
 * Load an HTML file into a DOMDocument with XPath ready.
 * Returns ['doc'=>DOMDocument, 'xpath'=>DOMXPath, 'path'=>string] or null.
 */
function loadDoc($filename) {
    $path = SITE_ROOT . '/' . $filename;
    if (!file_exists($path)) return null;

    $html = file_get_contents($path);
    $doc = new DOMDocument();
    $doc->preserveWhiteSpace = true;
    $doc->formatOutput = false;
    // Wrap in UTF-8 encoding to handle emojis/special chars
    @$doc->loadHTML(mb_convert_encoding($html, 'HTML-ENTITIES', 'UTF-8'),
        LIBXML_NOERROR | LIBXML_NOWARNING);

    return [
        'doc'   => $doc,
        'xpath' => new DOMXPath($doc),
        'path'  => $path
    ];
}

/**
 * Save DOMDocument back to file, preserving the original structure.
 * Throws RuntimeException on failure so the API can surface the error.
 */
function saveDoc($info) {
    $html = $info['doc']->saveHTML();
    // Remove the encoding meta DOMDocument injects
    $html = preg_replace('/<meta http-equiv="Content-Type"[^>]*>/i', '', $html, 1);
    if (!is_writable($info['path'])) {
        throw new \RuntimeException('File not writable: ' . $info['path'] . ' (chmod 644 required)');
    }
    $result = file_put_contents($info['path'], $html);
    if ($result === false) {
        throw new \RuntimeException('Write failed: ' . $info['path']);
    }
}

/**
 * Get first element by CSS class name via XPath.
 */
function byClass($xpath, $className, $context = null) {
    $query = ".//*[contains(concat(' ',normalize-space(@class),' '),' {$className} ')]";
    if ($context) {
        $nodes = $xpath->query($query, $context);
    } else {
        $query = "//*[contains(concat(' ',normalize-space(@class),' '),' {$className} ')]";
        $nodes = $xpath->query($query);
    }
    return ($nodes && $nodes->length > 0) ? $nodes->item(0) : null;
}

/**
 * Get ALL elements by CSS class name via XPath.
 */
function byClassAll($xpath, $className) {
    $query = "//*[contains(concat(' ',normalize-space(@class),' '),' {$className} ')]";
    return $xpath->query($query);
}

/**
 * Get element by ID.
 */
function byId($doc, $id) {
    return $doc->getElementById($id);
}

/**
 * Get first element matching a CSS selector like "#parent .child"
 */
function byIdThenClass($xpath, $parentId, $className) {
    $query = "//*[@id='{$parentId}']//*[contains(concat(' ',normalize-space(@class),' '),' {$className} ')]";
    $nodes = $xpath->query($query);
    return ($nodes && $nodes->length > 0) ? $nodes->item(0) : null;
}

/**
 * Set text content of an element (like jQuery .text()).
 */
function setText($element, $text) {
    if (!$element) return;
    // Remove all children
    while ($element->hasChildNodes()) {
        $element->removeChild($element->firstChild);
    }
    $element->appendChild($element->ownerDocument->createTextNode($text));
}

/**
 * Set inner HTML of an element (like jQuery .html()).
 */
function setInnerHTML($element, $html) {
    if (!$element) return;
    // Remove all children
    while ($element->hasChildNodes()) {
        $element->removeChild($element->firstChild);
    }
    if (trim($html) === '') return;

    // Parse the HTML fragment
    $tempDoc = new DOMDocument();
    @$tempDoc->loadHTML(
        '<div>' . mb_convert_encoding($html, 'HTML-ENTITIES', 'UTF-8') . '</div>',
        LIBXML_HTML_NOIMPLIED | LIBXML_HTML_NODEFDTD | LIBXML_NOERROR | LIBXML_NOWARNING
    );
    $wrapper = $tempDoc->getElementsByTagName('div')->item(0);
    if ($wrapper) {
        foreach ($wrapper->childNodes as $child) {
            $imported = $element->ownerDocument->importNode($child, true);
            $element->appendChild($imported);
        }
    }
}

/**
 * Set an attribute on elements matching selector (like jQuery .attr()).
 */
function setAttr($element, $attr, $value) {
    if (!$element) return;
    $element->setAttribute($attr, $value);
}

// ── Page Update Functions ───────────────────────────

function updateHomeHTML($data) {
    $info = loadDoc('index.html');
    if (!$info) return;
    $doc = $info['doc'];
    $xpath = $info['xpath'];

    // Hero
    if (!empty($data['hero'])) {
        $hero = $data['hero'];
        if (!empty($hero['label']))     setText(byClass($xpath, 'hero-label'), $hero['label']);
        if (!empty($hero['headline1'])) setText(byId($doc, 'hl1'), $hero['headline1']);
        if (!empty($hero['headline2'])) setText(byId($doc, 'hl2'), $hero['headline2']);
        if (!empty($hero['subtitle']))  setInnerHTML(byId($doc, 'hero-sub'), $hero['subtitle']);
    }

    // Suite
    if (!empty($data['suite'])) {
        $suite = $data['suite'];
        if (!empty($suite['sectionTitle'])) {
            setText(byIdThenClass($xpath, 'suite', 'section-title-center'), $suite['sectionTitle']);
        }
        if (!empty($suite['sectionSubtitle'])) {
            setInnerHTML(byIdThenClass($xpath, 'suite', 'section-subtitle-center'), $suite['sectionSubtitle']);
        }
        if (!empty($suite['cards'])) {
            $cardEls = byClassAll($xpath, 'suite-card');
            foreach ($suite['cards'] as $i => $card) {
                if ($i >= $cardEls->length) break;
                $el = $cardEls->item($i);
                if (!empty($card['name']))     setText(byClass($xpath, 'suite-card-name', $el), $card['name']);
                if (!empty($card['tagline']))   setText(byClass($xpath, 'suite-card-tagline', $el), $card['tagline']);
                if (isset($card['description'])) setText(byClass($xpath, 'suite-card-desc', $el), $card['description']);
            }
        }
    }

    // About
    if (!empty($data['about'])) {
        $about = $data['about'];
        if (!empty($about['sectionTitle'])) {
            setInnerHTML(byIdThenClass($xpath, 'research', 'section-title-center'), $about['sectionTitle']);
        }
        if (!empty($about['sectionSubtitle'])) {
            setText(byIdThenClass($xpath, 'research', 'section-subtitle-center'), $about['sectionSubtitle']);
        }
    }

    // Innovation
    if (!empty($data['innovation'])) {
        $innov = $data['innovation'];
        if (!empty($innov['sectionTitle'])) {
            setText(byIdThenClass($xpath, 'architecture', 'section-title-center'), $innov['sectionTitle']);
        }
        if (!empty($innov['sectionSubtitle'])) {
            setText(byIdThenClass($xpath, 'architecture', 'section-subtitle-center'), $innov['sectionSubtitle']);
        }
    }

    // R&D Solutions — render completed + active projects in solutions-grid
    updateHomeSolutionsGrid($xpath);

    // Portfolio — regenerate entire grid so add/delete work correctly
    if (!empty($data['portfolio'])) {
        $port = $data['portfolio'];
        if (!empty($port['sectionTitle'])) {
            setText(byIdThenClass($xpath, 'evidence', 'section-title-center'), $port['sectionTitle']);
        }
        if (!empty($port['sectionSubtitle'])) {
            setText(byIdThenClass($xpath, 'evidence', 'section-subtitle-center'), $port['sectionSubtitle']);
        }
        if (isset($port['clients']) && is_array($port['clients'])) {
            // Thumb classes cycle for visual variety
            $thumbClasses = ['portfolio-thumb', 'portfolio-thumb-alt', 'portfolio-thumb-dark', 'portfolio-thumb-accent'];
            $gridHtml = '';
            foreach ($port['clients'] as $i => $client) {
                $thumbCls = $thumbClasses[$i % count($thumbClasses)];
                $cat   = htmlspecialchars($client['category'] ?? '', ENT_QUOTES);
                $name  = htmlspecialchars($client['name'] ?? '', ENT_QUOTES);
                $desc  = htmlspecialchars($client['description'] ?? '', ENT_QUOTES);
                $tags  = $client['tags'] ?? [];
                $tagsHtml = '';
                foreach ($tags as $tag) {
                    $tagsHtml .= '<span class="portfolio-tag mono">' . htmlspecialchars($tag, ENT_QUOTES) . '</span>';
                }
                $gridHtml .= '
        <div class="portfolio-card reveal-up">
          <div class="' . $thumbCls . '">
            <span class="portfolio-cat mono">' . $cat . '</span>
          </div>
          <div class="portfolio-body">
            <div class="portfolio-client">
              <span class="portfolio-dot">◆</span>
              <h4>' . $name . '</h4>
            </div>
            <p>' . $desc . '</p>
            <div class="portfolio-tags">' . $tagsHtml . '</div>
          </div>
        </div>';
            }
            // Replace the entire portfolio-grid
            $grids = byClassAll($xpath, 'portfolio-grid');
            if ($grids->length > 0) {
                setInnerHTML($grids->item(0), $gridHtml);
            }
        }
    }

    // CTA
    if (!empty($data['cta'])) {
        $cta = $data['cta'];
        if (!empty($cta['label']))    setText(byClass($xpath, 'cta-label'), $cta['label']);
        if (!empty($cta['headline'])) setInnerHTML(byClass($xpath, 'cta-headline'), $cta['headline']);
        if (!empty($cta['body']))     setText(byClass($xpath, 'cta-body'), $cta['body']);
    }

    saveDoc($info);
}

function updateSettingsHTML($data) {
    $pages = [
        'index.html', 'projex.html', 'techvyuha.html', 'nexora-digital.html',
        'aetherai.html', 'automatax.html', 'veltrix.html',
        'rnd.html', 'blog.html', '404.html'
    ];

    foreach ($pages as $page) {
        $info = loadDoc($page);
        if (!$info) continue;
        $doc = $info['doc'];
        $xpath = $info['xpath'];

        // Footer
        if (!empty($data['footer'])) {
            if (!empty($data['footer']['description'])) {
                setText(byClass($xpath, 'footer-desc'), $data['footer']['description']);
            }
            if (!empty($data['footer']['email'])) {
                $email = $data['footer']['email'];
                $mailLinks = $xpath->query("//a[starts-with(@href,'mailto:')]");
                foreach ($mailLinks as $link) {
                    $link->setAttribute('href', 'mailto:' . $email);
                    setText($link, $email);
                }
            }
        }

        // Social
        if (!empty($data['social'])) {
            $socialMap = [
                'linkedin'  => 'LinkedIn',
                'twitter'   => 'X (Twitter)',
                'instagram' => 'Instagram',
                'reddit'    => 'Reddit'
            ];
            foreach ($socialMap as $key => $label) {
                if (!empty($data['social'][$key])) {
                    $el = $xpath->query("//a[@aria-label='{$label}']")->item(0);
                    if ($el) $el->setAttribute('href', $data['social'][$key]);
                }
            }
        }

        // Meta (index.html only)
        if (!empty($data['meta']) && $page === 'index.html') {
            if (!empty($data['meta']['siteTitle'])) {
                $title = $doc->getElementsByTagName('title')->item(0);
                if ($title) setText($title, $data['meta']['siteTitle']);
            }
            if (!empty($data['meta']['siteDescription'])) {
                $metas = $doc->getElementsByTagName('meta');
                foreach ($metas as $m) {
                    if ($m->getAttribute('name') === 'description') {
                        $m->setAttribute('content', $data['meta']['siteDescription']);
                        break;
                    }
                }
            }
        }

        saveDoc($info);
    }
}

function updateSuitePageHTML($filename, $data) {
    $info = loadDoc($filename);
    if (!$info) return;
    $doc = $info['doc'];
    $xpath = $info['xpath'];

    // Title tag
    if (!empty($data['heroTitle'])) {
        $title = $doc->getElementsByTagName('title')->item(0);
        if ($title) setText($title, $data['heroTitle'] . ' — Canonix Suite');

        $nameEl = byClass($xpath, 'division-hero-name');
        if ($nameEl) setInnerHTML($nameEl, htmlspecialchars($data['heroTitle']) . '<span class="brand-dot">.</span>');
    }

    if (!empty($data['heroTagline'])) {
        setText(byClass($xpath, 'division-hero-tagline'), $data['heroTagline']);
    }
    if (!empty($data['heroDesc'])) {
        setText(byClass($xpath, 'division-hero-desc'), $data['heroDesc']);
    }
    if (!empty($data['heroLabel'])) {
        setText(byClass($xpath, 'division-hero-label'), $data['heroLabel']);
    }

    // Services
    if (!empty($data['services'])) {
        $serviceEls = byClassAll($xpath, 'service-item');
        foreach ($data['services'] as $i => $svc) {
            if ($i >= $serviceEls->length) break;
            $el = $serviceEls->item($i);
            if (!empty($svc['icon']))        setText(byClass($xpath, 'service-icon-box', $el), $svc['icon']);
            if (!empty($svc['name']))        setText(byClass($xpath, 'service-name', $el), $svc['name']);
            if (!empty($svc['description'])) setText(byClass($xpath, 'service-desc', $el), $svc['description']);
        }
    }

    // CTA
    if (!empty($data['ctaHeadline'])) {
        setInnerHTML(byClass($xpath, 'division-cta-headline'), $data['ctaHeadline']);
    }
    if (!empty($data['ctaDesc'])) {
        setText(byClass($xpath, 'division-cta-desc'), $data['ctaDesc']);
    }

    saveDoc($info);
}
/* ═══════════════════════════════════════════════════════
   BLOG HTML UPDATE — regenerates featured post + list
═══════════════════════════════════════════════════════ */
function updateBlogHTML($data) {
    $info = loadDoc('blog.html');
    if (!$info) return;
    $xpath = $info['xpath'];

    if (!empty($data['title'])) {
        $el = byClass($xpath, 'journal-title');
        if ($el) setInnerHTML($el, htmlspecialchars($data['title'], ENT_QUOTES));
    }
    if (!empty($data['subtitle'])) {
        $el = byClass($xpath, 'journal-desc');
        if ($el) setText($el, $data['subtitle']);
    }

    $posts = $data['posts'] ?? [];
    if (empty($posts)) { saveDoc($info); return; }

    // Split: first post with featured=true is the hero; rest go into the list
    $featured = null;
    $list = [];
    foreach ($posts as $p) {
        if (!empty($p['featured']) && $featured === null) { $featured = $p; }
        else { $list[] = $p; }
    }
    if ($featured === null) { $featured = $posts[0]; $list = array_slice($posts, 1); }

    // Regenerate featured section
    $featuredSection = byClass($xpath, 'journal-featured');
    if ($featuredSection) {
        $cat     = strtoupper(htmlspecialchars($featured['category'] ?? '', ENT_QUOTES));
        $date    = htmlspecialchars($featured['date'] ?? '', ENT_QUOTES);
        $read    = htmlspecialchars($featured['readTime'] ?? '', ENT_QUOTES);
        $title   = htmlspecialchars($featured['title'] ?? '', ENT_QUOTES);
        $excerpt = htmlspecialchars($featured['excerpt'] ?? '', ENT_QUOTES);
        $catData = strtolower(htmlspecialchars($featured['category'] ?? ''));
        $html = '<div class="journal-inner"><div class="entry-featured" data-category="' . $catData . '">'
            . '<div class="ef-meta"><span class="mono ef-tag">' . $cat . '</span>'
            . '<span class="mono ef-date">' . $date . '</span>'
            . '<span class="mono ef-read">' . $read . '</span></div>'
            . '<h2 class="ef-title"><a href="#">' . $title . '</a></h2>'
            . '<p class="ef-body">' . $excerpt . '</p>'
            . '<div class="ef-footer"><a href="#" class="ef-link mono">Read entry &rarr;</a></div>'
            . '</div></div>';
        setInnerHTML($featuredSection, $html);
    }

    // Regenerate list section
    $listSection = byClass($xpath, 'journal-list-section');
    if ($listSection) {
        $listHtml = '<div class="journal-inner">';
        foreach ($list as $idx => $p) {
            $num     = str_pad($idx + 1, 2, '0', STR_PAD_LEFT);
            $cat     = strtoupper(htmlspecialchars($p['category'] ?? '', ENT_QUOTES));
            $date    = htmlspecialchars($p['date'] ?? '', ENT_QUOTES);
            $title   = htmlspecialchars($p['title'] ?? '', ENT_QUOTES);
            $excerpt = htmlspecialchars($p['excerpt'] ?? '', ENT_QUOTES);
            $read    = htmlspecialchars($p['readTime'] ?? '', ENT_QUOTES);
            $catData = strtolower(htmlspecialchars($p['category'] ?? ''));
            if ($idx > 0) $listHtml .= '<div class="je-divider"></div>';
            $listHtml .= '<article class="journal-entry" data-category="' . $catData . '">'
                . '<div class="je-index mono">' . $num . '</div>'
                . '<div class="je-body"><div class="je-meta">'
                . '<span class="mono je-tag">' . $cat . '</span>'
                . '<span class="mono je-date">' . $date . '</span>'
                . '</div><h3 class="je-title"><a href="#">' . $title . '</a></h3>'
                . '<p class="je-excerpt">' . $excerpt . '</p></div>'
                . '<div class="je-right"><span class="mono je-read">' . $read . '</span>'
                . '<a href="#" class="je-cta mono">&rarr;</a></div></article>';
        }
        $listHtml .= '</div>';
        setInnerHTML($listSection, $listHtml);
    }

    saveDoc($info);
}

/* ═══════════════════════════════════════════════════════
   R&D HTML UPDATE — regenerates grouped project cards
═══════════════════════════════════════════════════════ */
function updateRndHTML($data) {
    $info = loadDoc('rnd.html');
    if (!$info) return;
    $xpath = $info['xpath'];

    if (!empty($data['title'])) {
        $el = byClass($xpath, 'rnd-hero-title');
        if ($el) setText($el, $data['title']);
    }
    if (!empty($data['subtitle'])) {
        $el = byClass($xpath, 'rnd-hero-desc');
        if ($el) setText($el, $data['subtitle']);
    }

    $projects = $data['projects'] ?? [];
    if (empty($projects)) { saveDoc($info); return; }

    // Group by status
    $groups = ['completed' => [], 'active' => [], 'planning' => []];
    foreach ($projects as $p) {
        $s = $p['status'] ?? 'planning';
        $groups[$s][] = $p;
    }

    $statusMap = [
        'completed' => ['cls' => 'rnd-status-completed', 'label' => 'Completed'],
        'active'    => ['cls' => 'rnd-status-active',    'label' => 'Active'],
        'planning'  => ['cls' => 'rnd-status-planning',  'label' => 'Planning'],
    ];
    $groupTitles = ['completed' => 'Completed Solutions', 'active' => 'Ongoing Research', 'planning' => 'Upcoming Projects'];

    $html = '';
    foreach ($groups as $status => $items) {
        if (empty($items)) continue;
        $html .= '<h2 class="rnd-section-title">' . $groupTitles[$status] . '</h2><div class="rnd-grid">';
        foreach ($items as $p) {
            $sm       = $statusMap[$status];
            $date     = htmlspecialchars($p['date'] ?? '', ENT_QUOTES);
            $title    = htmlspecialchars($p['title'] ?? '', ENT_QUOTES);
            $desc     = htmlspecialchars($p['description'] ?? '', ENT_QUOTES);
            $progress = (int)($p['progress'] ?? 0);
            $tagsHtml = '';
            foreach (($p['tags'] ?? []) as $t) {
                $tagsHtml .= '<span class="rnd-tag mono">' . htmlspecialchars($t, ENT_QUOTES) . '</span>';
            }
            $progressHtml = '';
            if ($status === 'active') {
                $progressHtml = '<div class="rnd-progress-bar"><div class="rnd-progress-track">'
                    . '<div class="rnd-progress-fill" style="width:' . $progress . '%"></div>'
                    . '</div><span class="mono rnd-progress-label">' . $progress . '% Complete</span></div>';
            }
            $html .= '<article class="rnd-card" data-status="' . $status . '">'
                . '<div class="rnd-card-header"><span class="rnd-status ' . $sm['cls'] . ' mono">' . $sm['label'] . '</span>'
                . '<span class="mono rnd-date">' . $date . '</span></div>'
                . '<h3 class="rnd-card-title">' . $title . '</h3>'
                . '<p class="rnd-card-desc">' . $desc . '</p>'
                . '<div class="rnd-card-tags">' . $tagsHtml . '</div>'
                . $progressHtml
                . '<div class="rnd-card-footer"><a href="#" class="rnd-card-link mono">Read Research Blog &rarr;</a></div>'
                . '</article>';
        }
        $html .= '</div>';
    }

    // Auto-calculated stats bar
    $html .= '<div class="rnd-stats">'
        . '<div class="rnd-stat"><span class="rnd-stat-num">' . count($groups['completed']) . '</span><span class="mono rnd-stat-label">Completed Solutions</span></div>'
        . '<div class="rnd-stat"><span class="rnd-stat-num">' . count($groups['active']) . '</span><span class="mono rnd-stat-label">Active Research</span></div>'
        . '<div class="rnd-stat"><span class="rnd-stat-num">' . count($groups['planning']) . '</span><span class="mono rnd-stat-label">Upcoming Projects</span></div>'
        . '<div class="rnd-stat"><span class="rnd-stat-num">' . count($projects) . '</span><span class="mono rnd-stat-label">Total Initiatives</span></div>'
        . '</div>';

    // Replace the rnd-content-inner container inner HTML, preserving the filter tabs
    $container = byClass($xpath, 'rnd-content-inner');
    if ($container) {
        // Preserve the filter bar (first child div)
        $filterHtml = '';
        $filterDiv = byClass($xpath, 'rnd-filters', $container);
        if ($filterDiv) {
            $temp = new DOMDocument();
            $temp->appendChild($temp->importNode($filterDiv, true));
            $filterHtml = $temp->saveHTML();
        }
        setInnerHTML($container, $filterHtml . $html);
    }

    saveDoc($info);

    // Also update homepage solutions grid when R&D data changes
    $homeInfo = loadDoc('index.html');
    if ($homeInfo) {
        $homeXpath = $homeInfo['xpath'];
        updateHomeSolutionsGrid($homeXpath);
        saveDoc($homeInfo);
    }
}

/* ═══════════════════════════════════════════════════════
   HOME SOLUTIONS GRID — renders R&D projects on homepage
   Pulls completed + active projects from DB
═══════════════════════════════════════════════════════ */
function updateHomeSolutionsGrid($xpath) {
    // Fetch R&D data from DB
    try {
        $db = getDB();
        $stmt = $db->prepare("SELECT data FROM content WHERE section = 'rnd' LIMIT 1");
        $stmt->execute();
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$row) return;
        $rndData = json_decode($row['data'], true);
        if (!$rndData || empty($rndData['projects'])) return;
    } catch (Exception $e) {
        return; // DB error — skip silently
    }

    $projects = $rndData['projects'];
    $showable = [];
    // Completed first, then active
    foreach ($projects as $p) {
        if (($p['status'] ?? '') === 'completed') $showable[] = $p;
    }
    foreach ($projects as $p) {
        if (($p['status'] ?? '') === 'active') $showable[] = $p;
    }

    $grids = byClassAll($xpath, 'solutions-grid');
    if ($grids->length === 0) return;
    $grid = $grids->item(0);

    if (empty($showable)) {
        setInnerHTML($grid, '<p style="opacity:0.5;text-align:center;width:100%">No projects yet.</p>');
        return;
    }

    $icons = ['🌿', '🔬', '🤖', '⚡', '🔧', '📊', '🛡️', '🎯'];
    $gridHtml = '';
    foreach ($showable as $i => $p) {
        $icon  = $icons[$i % count($icons)];
        $title = htmlspecialchars($p['title'] ?? '', ENT_QUOTES);
        $desc  = htmlspecialchars($p['description'] ?? '', ENT_QUOTES);
        $tagsHtml = '';
        foreach (($p['tags'] ?? []) as $t) {
            $tagsHtml .= '<span class="solution-tag mono">' . htmlspecialchars($t, ENT_QUOTES) . '</span>';
        }
        $gridHtml .= '<div class="solution-card reveal-up">'
            . '<div class="solution-icon-wrap"><span class="solution-icon">' . $icon . '</span></div>'
            . '<h4 class="solution-name">' . $title . '</h4>'
            . '<p class="solution-desc">' . $desc . '</p>'
            . '<div class="solution-tags">' . $tagsHtml . '</div>'
            . '<a href="rnd.html" class="solution-link mono">View Case Study →</a>'
            . '</div>';
    }
    setInnerHTML($grid, $gridHtml);
}
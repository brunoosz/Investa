package com.investa.app;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import androidx.work.Worker;
import androidx.work.WorkerParameters;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.List;
import java.util.Locale;
import java.util.TimeZone;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Análise diária da IA feita pelo Android (app fechado): lê as manchetes das
 * mesmas fontes do app (core/news.ts) e a Selic/IPCA do Banco Central, pede à
 * IA (Groq primeiro, NVIDIA de reserva) uma ideia curta e avisa. Uma por dia,
 * só depois da hora escolhida e nunca entre 22h e 8h.
 */
public class InsightWorker extends Worker {
    private static final String CHANNEL = "investa-analise";
    private static final String GROQ_URL = "https://api.groq.com/openai/v1";
    private static final String DISCLAIMER = "Conteúdo educativo, não é recomendação de investimento.";
    private static final String[] FEEDS = {
        "https://www.infomoney.com.br/feed/|InfoMoney",
        "https://www.moneytimes.com.br/feed/|Money Times",
        "https://g1.globo.com/rss/g1/economia/|g1 Economia",
        "https://exame.com/feed/|Exame",
        "https://www.cnnbrasil.com.br/economia/feed/|CNN Brasil Economia",
    };
    private static final Pattern ITEM_TITLE = Pattern.compile("<item[\\s>][\\s\\S]*?<title[^>]*>([\\s\\S]*?)</title>", Pattern.CASE_INSENSITIVE);

    public InsightWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    @NonNull
    @Override
    public Result doWork() {
        Context ctx = getApplicationContext();
        SharedPreferences p = BackgroundPlugin.prefs(ctx);
        if (!p.getBoolean("enabled", false) || !p.getBoolean("notify", true)) return Result.success();
        Calendar now = Calendar.getInstance(TimeZone.getTimeZone("America/Sao_Paulo"));
        int hour = now.get(Calendar.HOUR_OF_DAY);
        if (hour >= 22 || hour < Math.max(8, p.getInt("hour", 9))) return Result.success();
        SimpleDateFormat fmt = new SimpleDateFormat("yyyy-MM-dd", Locale.US);
        fmt.setTimeZone(TimeZone.getTimeZone("America/Sao_Paulo"));
        String today = fmt.format(now.getTime());
        if (today.equals(p.getString("doneDate", "")) || today.equals(p.getString("triedDate", ""))) return Result.success();

        String groqKey = p.getString("groqKey", "");
        String nvidiaKey = p.getString("nvidiaKey", "");
        if (groqKey.isEmpty() && nvidiaKey.isEmpty()) return Result.success();

        StringBuilder user = new StringBuilder();
        user.append("Data: ").append(today).append('\n');
        user.append(p.getString("profile", "")).append('\n');
        String ind = indicators();
        if (!ind.isEmpty()) user.append("Indicadores: ").append(ind).append('\n');
        List<String> news = headlines();
        if (news.isEmpty() && ind.isEmpty()) return Result.retry();
        user.append("Manchetes de hoje:\n");
        for (String n : news) user.append("- ").append(n).append('\n');

        String answer = null;
        String usedModel = null;
        String lastError = "sem resposta";
        String lastCode = "AI_DOWN";
        List<String[]> targets = new ArrayList<>();
        if (!groqKey.isEmpty()) for (String m : lines(p.getString("groqModels", ""))) targets.add(new String[] {GROQ_URL, groqKey, m, "groq:" + m});
        if (!nvidiaKey.isEmpty()) for (String m : lines(p.getString("nvidiaModels", ""))) targets.add(new String[] {p.getString("nvidiaBaseUrl", "https://integrate.api.nvidia.com/v1"), nvidiaKey, m, m});
        for (String[] t : targets) {
            try {
                answer = chat(t[0], t[1], t[2], p.getString("systemPrompt", ""), user.toString());
                if (answer != null && !answer.trim().isEmpty()) {
                    usedModel = t[3];
                    break;
                }
            } catch (HttpError e) {
                lastCode = e.status == 401 || e.status == 403 ? "AI_AUTH" : e.status == 429 ? "AI_RATE" : e.status == 404 ? "AI_MODEL" : "AI_DOWN";
                lastError = "HTTP " + e.status;
            } catch (Exception e) {
                lastCode = "AI_OFFLINE";
                lastError = e.getClass().getSimpleName();
            }
        }
        // Uma tentativa por dia: o ciclo de 3 horas não insiste numa IA fora do ar.
        p.edit().putString("triedDate", today).apply();

        String[] parsed = answer == null ? null : parse(answer);
        if (parsed == null) {
            try {
                JSONObject err = new JSONObject();
                err.put("at", iso());
                err.put("code", answer == null ? lastCode : "AI_EMPTY");
                err.put("message", answer == null ? lastError : "resposta sem o formato esperado");
                p.edit().putString("error", err.toString()).apply();
            } catch (Exception ignored) {
                // sem registro
            }
            if (p.getBoolean("owner", false)) post(ctx, 2, "Análise diária da IA falhou", (answer == null ? lastCode + " (" + lastError + ")" : "Resposta fora do formato") + ". Veja em Logs.", "/logs");
            return Result.success();
        }
        try {
            JSONObject json = new JSONObject();
            json.put("date", today);
            json.put("at", iso());
            json.put("title", parsed[0]);
            json.put("why", parsed[1]);
            if (usedModel != null) json.put("model", usedModel);
            p.edit().putString("insight", json.toString()).putString("doneDate", today).apply();
        } catch (Exception ignored) {
            // segue só com o aviso
        }
        String body = (parsed[1].isEmpty() ? "" : "Porque " + parsed[1].replaceFirst("(?i)^porque\\s+", "") + " ") + DISCLAIMER;
        post(ctx, 1, "Hoje: " + parsed[0], body, "/");
        return Result.success();
    }

    private static class HttpError extends Exception {
        final int status;

        HttpError(int status) {
            super("HTTP " + status);
            this.status = status;
        }
    }

    private static List<String> lines(String s) {
        List<String> out = new ArrayList<>();
        for (String l : s.split("\n")) if (!l.trim().isEmpty()) out.add(l.trim());
        return out;
    }

    private static String iso() {
        SimpleDateFormat f = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
        f.setTimeZone(TimeZone.getTimeZone("UTC"));
        return f.format(new java.util.Date());
    }

    private static String read(HttpURLConnection c, int max) throws Exception {
        try (InputStream in = c.getInputStream()) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) > 0 && out.size() < max) out.write(buf, 0, n);
            return new String(out.toByteArray(), StandardCharsets.UTF_8);
        }
    }

    private static String get(String url, String accept) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setConnectTimeout(10_000);
        c.setReadTimeout(15_000);
        c.setRequestProperty("Accept", accept);
        c.setRequestProperty("User-Agent", "Mozilla/5.0 (Linux; Android) Investa");
        try {
            if (c.getResponseCode() != 200) throw new HttpError(c.getResponseCode());
            return read(c, 600_000);
        } finally {
            c.disconnect();
        }
    }

    private static String clean(String s) {
        return s.replace("<![CDATA[", "").replace("]]>", "").replaceAll("<[^>]+>", " ")
            .replace("&amp;", "&").replace("&quot;", "\"").replace("&#39;", "'").replace("&#039;", "'")
            .replace("&lt;", "<").replace("&gt;", ">").replace("&nbsp;", " ")
            .replaceAll("\\s+", " ").trim();
    }

    private static List<String> headlines() {
        List<String> out = new ArrayList<>();
        for (String feed : FEEDS) {
            String[] f = feed.split("\\|");
            try {
                Matcher m = ITEM_TITLE.matcher(get(f[0], "application/rss+xml, application/xml, text/xml"));
                int count = 0;
                while (m.find() && count < 4) {
                    String title = clean(m.group(1));
                    if (title.isEmpty()) continue;
                    out.add(title + " (" + f[1] + ")");
                    count++;
                }
            } catch (Exception ignored) {
                // fonte fora do ar: segue com as outras
            }
        }
        return out;
    }

    private static String sgs(int code) throws Exception {
        JSONArray arr = new JSONArray(get("https://api.bcb.gov.br/dados/serie/bcdata.sgs." + code + "/dados/ultimos/1?formato=json", "application/json"));
        return arr.getJSONObject(0).getString("valor").replace(".", ",");
    }

    private static String indicators() {
        List<String> parts = new ArrayList<>();
        try {
            parts.add("Selic " + sgs(432) + "% a.a.");
        } catch (Exception ignored) {
            // sem Selic
        }
        try {
            parts.add("IPCA 12 meses " + sgs(13522) + "%");
        } catch (Exception ignored) {
            // sem IPCA
        }
        return android.text.TextUtils.join(", ", parts);
    }

    private static String chat(String baseUrl, String key, String model, String system, String user) throws Exception {
        JSONObject body = new JSONObject();
        body.put("model", model);
        body.put("max_tokens", 400);
        body.put("temperature", 0.4);
        body.put("stream", false);
        JSONArray messages = new JSONArray();
        messages.put(new JSONObject().put("role", "system").put("content", system));
        messages.put(new JSONObject().put("role", "user").put("content", user));
        body.put("messages", messages);
        HttpURLConnection c = (HttpURLConnection) new URL(baseUrl.replaceAll("/+$", "") + "/chat/completions").openConnection();
        c.setConnectTimeout(20_000);
        c.setReadTimeout(120_000);
        c.setRequestMethod("POST");
        c.setDoOutput(true);
        c.setRequestProperty("Content-Type", "application/json");
        c.setRequestProperty("Accept", "application/json");
        c.setRequestProperty("Authorization", "Bearer " + key);
        try {
            try (OutputStream out = c.getOutputStream()) {
                out.write(body.toString().getBytes(StandardCharsets.UTF_8));
            }
            int status = c.getResponseCode();
            if (status != 200) throw new HttpError(status);
            JSONObject res = new JSONObject(read(c, 200_000));
            String text = res.getJSONArray("choices").getJSONObject(0).getJSONObject("message").optString("content", "");
            return text.replaceAll("(?s)<think>.*?</think>", "").trim();
        } finally {
            c.disconnect();
        }
    }

    /** Mesmo formato de shared/insight.ts (parseInsight): "HOJE: …" e "PORQUE: …". */
    static String[] parse(String text) {
        String title = "";
        String why = "";
        for (String raw : text.split("\n")) {
            String line = raw.replace("**", "").replace("__", "").replace("`", "").trim();
            String lower = line.toLowerCase(Locale.ROOT);
            int colon = line.indexOf(':');
            if (colon < 0) continue;
            String value = line.substring(colon + 1).trim();
            if (lower.startsWith("hoje")) title = value;
            else if (lower.startsWith("porque") || lower.startsWith("por que") || lower.startsWith("por quê") || lower.startsWith("motivo")) why = value;
        }
        title = title.replaceAll("[.;]+$", "");
        if (title.length() < 4) return null;
        if (title.length() > 120) title = title.substring(0, 120);
        if (why.length() > 400) why = why.substring(0, 400);
        return new String[] {title, why};
    }

    private static void post(Context ctx, int id, String title, String body, String link) {
        if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(ctx, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return;
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationManager nm = ctx.getSystemService(NotificationManager.class);
            if (nm != null && nm.getNotificationChannel(CHANNEL) == null) {
                NotificationChannel ch = new NotificationChannel(CHANNEL, "Análise diária da IA", NotificationManager.IMPORTANCE_DEFAULT);
                ch.setDescription("Uma ideia por dia com base nas notícias e no seu perfil");
                nm.createNotificationChannel(ch);
            }
        }
        Intent intent = new Intent(ctx, MainActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        intent.putExtra("link", link);
        PendingIntent pi = PendingIntent.getActivity(ctx, id, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        NotificationCompat.Builder b = new NotificationCompat.Builder(ctx, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_investa)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setContentIntent(pi)
            .setAutoCancel(true);
        try {
            NotificationManagerCompat.from(ctx).notify(9000 + id, b.build());
        } catch (SecurityException ignored) {
            // permissão retirada nesse meio tempo
        }
    }
}

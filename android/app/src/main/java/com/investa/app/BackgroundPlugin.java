package com.investa.app;

import android.content.Context;
import android.content.SharedPreferences;
import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.ExistingWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.Calendar;
import java.util.TimeZone;
import java.util.concurrent.TimeUnit;
import org.json.JSONException;

/**
 * Análise diária da IA com o app fechado. O app (core/backend.ts) passa aqui
 * as chaves da IA, o texto do pedido e as preferências; o InsightWorker roda
 * pelo WorkManager a cada 3 horas e avisa uma vez por dia. As chaves ficam nas
 * preferências privadas do app e nunca vão para o log.
 */
@CapacitorPlugin(name = "InvestaBackground")
public class BackgroundPlugin extends Plugin {
    static final String PREFS = "investa_background";
    static final String WORK_PERIODIC = "investa-insight";
    static final String WORK_ONCE = "investa-insight-once";

    static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    @PluginMethod
    public void configure(PluginCall call) {
        Context context = getContext();
        boolean enabled = call.getBoolean("enabled", false);
        int hour = call.getInt("hour", 9);
        SharedPreferences.Editor e = prefs(context).edit();
        e.putBoolean("enabled", enabled);
        e.putBoolean("notify", call.getBoolean("notify", true));
        e.putBoolean("owner", call.getBoolean("owner", false));
        e.putInt("hour", hour);
        e.putString("groqKey", call.getString("groqKey", ""));
        e.putString("nvidiaKey", call.getString("nvidiaKey", ""));
        e.putString("nvidiaBaseUrl", call.getString("nvidiaBaseUrl", "https://integrate.api.nvidia.com/v1"));
        e.putString("groqModels", join(call.getArray("groqModels")));
        e.putString("nvidiaModels", join(call.getArray("nvidiaModels")));
        e.putString("systemPrompt", call.getString("systemPrompt", ""));
        e.putString("profile", call.getString("profile", ""));
        String done = call.getString("doneDate");
        if (done != null && !done.isEmpty()) e.putString("doneDate", done);
        e.apply();

        WorkManager wm = WorkManager.getInstance(context);
        if (!enabled) {
            wm.cancelUniqueWork(WORK_PERIODIC);
            wm.cancelUniqueWork(WORK_ONCE);
            call.resolve();
            return;
        }
        Constraints constraints = new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build();
        PeriodicWorkRequest periodic = new PeriodicWorkRequest.Builder(InsightWorker.class, 3, TimeUnit.HOURS).setConstraints(constraints).build();
        wm.enqueueUniquePeriodicWork(WORK_PERIODIC, ExistingPeriodicWorkPolicy.KEEP, periodic);
        // Uma rodada extra perto da hora escolhida, para não depender só do ciclo de 3 horas.
        OneTimeWorkRequest once = new OneTimeWorkRequest.Builder(InsightWorker.class)
            .setConstraints(constraints)
            .setInitialDelay(delayUntil(hour), TimeUnit.MILLISECONDS)
            .build();
        wm.enqueueUniqueWork(WORK_ONCE, ExistingWorkPolicy.REPLACE, once);
        call.resolve();
    }

    /** Entrega ao app a última análise e o último erro, uma vez cada. */
    @PluginMethod
    public void take(PluginCall call) {
        SharedPreferences p = prefs(getContext());
        JSObject ret = new JSObject();
        String insight = p.getString("insight", null);
        String error = p.getString("error", null);
        if (insight != null) ret.put("insight", insight);
        if (error != null) ret.put("error", error);
        p.edit().remove("insight").remove("error").apply();
        call.resolve(ret);
    }

    private static String join(JSArray arr) {
        if (arr == null) return "";
        StringBuilder sb = new StringBuilder();
        try {
            for (int i = 0; i < arr.length(); i++) {
                String s = arr.getString(i);
                if (s == null || s.isEmpty()) continue;
                if (sb.length() > 0) sb.append('\n');
                sb.append(s);
            }
        } catch (JSONException ignored) {
            // lista inválida: usa o que deu para ler
        }
        return sb.toString();
    }

    private static long delayUntil(int hour) {
        Calendar now = Calendar.getInstance(TimeZone.getTimeZone("America/Sao_Paulo"));
        Calendar at = (Calendar) now.clone();
        at.set(Calendar.HOUR_OF_DAY, hour);
        at.set(Calendar.MINUTE, 5);
        at.set(Calendar.SECOND, 0);
        if (!at.after(now)) at.add(Calendar.DAY_OF_MONTH, 1);
        return at.getTimeInMillis() - now.getTimeInMillis();
    }
}

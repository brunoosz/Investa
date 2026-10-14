package com.investa.app;

import android.content.ComponentName;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Trocar ícone: o app tem dois atalhos de abertura (activity-alias) no
 * manifesto, um com o ícone escuro e outro com o claro, e só um fica ativo.
 * A troca é aplicada quando o app sai da tela (MainActivity.onStop), porque
 * alguns Android fecham o app se o atalho muda com ele aberto.
 */
@CapacitorPlugin(name = "AppIcon")
public class AppIconPlugin extends Plugin {
    private static final String PREFS = "investa_app_icon";

    @PluginMethod
    public void set(PluginCall call) {
        String variant = "light".equals(call.getString("variant")) ? "light" : "dark";
        prefs(getContext()).edit().putString("pending", variant).apply();
        call.resolve();
    }

    static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    /** Ativa o atalho da variante pendente e desativa o outro. */
    static void applyPending(Context context) {
        SharedPreferences p = prefs(context);
        String pending = p.getString("pending", null);
        if (pending == null) return;
        PackageManager pm = context.getPackageManager();
        String pkg = context.getPackageName();
        boolean light = "light".equals(pending);
        try {
            pm.setComponentEnabledSetting(new ComponentName(pkg, pkg + ".IconLight"), light ? PackageManager.COMPONENT_ENABLED_STATE_ENABLED : PackageManager.COMPONENT_ENABLED_STATE_DISABLED, PackageManager.DONT_KILL_APP);
            pm.setComponentEnabledSetting(new ComponentName(pkg, pkg + ".IconDark"), light ? PackageManager.COMPONENT_ENABLED_STATE_DISABLED : PackageManager.COMPONENT_ENABLED_STATE_ENABLED, PackageManager.DONT_KILL_APP);
            p.edit().remove("pending").apply();
        } catch (Exception ignored) {
            // tenta de novo na próxima vez que o app sair da tela
        }
    }
}

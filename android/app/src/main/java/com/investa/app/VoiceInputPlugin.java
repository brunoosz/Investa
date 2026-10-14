package com.investa.app;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.speech.RecognizerIntent;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.ArrayList;

/**
 * Ditado por voz: abre o reconhecimento de voz do Android (o mesmo do teclado
 * do Google) em português e devolve o texto. Não precisa de permissão de
 * microfone no app, porque quem grava é o serviço de voz do sistema.
 */
@CapacitorPlugin(name = "VoiceInput")
public class VoiceInputPlugin extends Plugin {

    @PluginMethod
    public void listen(PluginCall call) {
        Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, call.getString("language", "pt-BR"));
        intent.putExtra(RecognizerIntent.EXTRA_PROMPT, call.getString("prompt", "Fale com o Assistente"));
        intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);
        try {
            startActivityForResult(call, intent, "onResult");
        } catch (ActivityNotFoundException e) {
            call.reject("Este aparelho não tem o reconhecimento de voz do Google instalado.");
        }
    }

    @ActivityCallback
    private void onResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        JSObject ret = new JSObject();
        if (result.getResultCode() == Activity.RESULT_OK && result.getData() != null) {
            ArrayList<String> matches = result.getData().getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS);
            ret.put("text", matches != null && !matches.isEmpty() ? matches.get(0) : "");
        } else {
            ret.put("text", "");
        }
        call.resolve(ret);
    }
}

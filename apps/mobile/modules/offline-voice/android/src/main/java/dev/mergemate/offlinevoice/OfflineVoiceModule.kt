package dev.mergemate.offlinevoice

import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.speech.tts.Voice
import expo.modules.kotlin.Promise
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/** One engine owns both local-voice verification and synthesis. No default/network voice fallback. */
class OfflineVoiceModule : Module() {
  private val main = Handler(Looper.getMainLooper())
  private var engine: TextToSpeech? = null
  private var ready = false
  private var failed = false
  private var pendingSpeech: Pair<String, Promise>? = null
  private val waiting = mutableListOf<Promise>()

  private fun reject(promise: Promise) = promise.reject("E_LOCAL_SPEECH", "Local speech is unavailable.", null)
  private fun localVoices(): List<Voice> = engine?.voices?.filter {
    !it.isNetworkConnectionRequired && !it.features.contains(TextToSpeech.Engine.KEY_FEATURE_NOT_INSTALLED)
  } ?: emptyList()
  private fun resolveVoices(promise: Promise) {
    try { promise.resolve(localVoices().map { mapOf("identifier" to it.name, "language" to it.locale.toLanguageTag()) }) }
    catch (_: Exception) { reject(promise) }
  }
  private fun stopCurrent() {
    val prior = pendingSpeech
    pendingSpeech = null
    engine?.stop()
    prior?.let { reject(it.second) }
  }
  private fun complete(id: String?, success: Boolean) {
    main.post {
      val prior = pendingSpeech
      if (prior != null && prior.first == id) {
        pendingSpeech = null
        if (success) prior.second.resolve() else reject(prior.second)
      }
    }
  }
  private fun initialize() {
    if (engine != null) return
    engine = TextToSpeech(appContext.reactContext) { status -> main.post {
      if (!failed) {
        ready = status == TextToSpeech.SUCCESS
        failed = !ready
        if (ready) engine?.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
          override fun onStart(id: String?) {}
          override fun onDone(id: String?) { complete(id, true) }
          @Deprecated("Android callback")
          override fun onError(id: String?) { complete(id, false) }
          override fun onStop(id: String?, interrupted: Boolean) { complete(id, false) }
        })
        val promises = waiting.toList(); waiting.clear()
        promises.forEach { if (ready) resolveVoices(it) else reject(it) }
      }
    } }
    main.postDelayed({
      if (!ready && !failed) {
        failed = true
        waiting.toList().forEach { reject(it) }; waiting.clear()
        engine?.shutdown()
      }
    }, 10_000)
  }
  override fun definition() = ModuleDefinition {
    Name("MergeMateOfflineVoice")
    AsyncFunction("getLocalVoicesAsync") { promise: Promise ->
      when {
        failed -> reject(promise)
        ready -> resolveVoices(promise)
        waiting.size >= 4 -> reject(promise)
        else -> { waiting.add(promise); initialize() }
      }
    }.runOnQueue(Queues.MAIN)
    AsyncFunction("speakAsync") { text: String, identifier: String, rate: Double, id: String, promise: Promise ->
      try {
        val tts = engine
        val voice = localVoices().firstOrNull { it.name == identifier }
        if (!ready || tts == null || voice == null || text.isBlank() || text.length > 600 || rate !in 0.75..1.5 || id.length > 80) {
          reject(promise)
        } else {
          stopCurrent()
          if (tts.setVoice(voice) != TextToSpeech.SUCCESS || tts.setSpeechRate(rate.toFloat()) != TextToSpeech.SUCCESS) reject(promise)
          else {
            pendingSpeech = Pair(id, promise)
            if (tts.speak(text, TextToSpeech.QUEUE_FLUSH, Bundle.EMPTY, id) != TextToSpeech.SUCCESS) {
              pendingSpeech = null; reject(promise)
            }
          }
        }
      } catch (_: Exception) { pendingSpeech = null; reject(promise) }
    }.runOnQueue(Queues.MAIN)
    AsyncFunction("stopAsync") { stopCurrent() }.runOnQueue(Queues.MAIN)
    OnDestroy {
      main.post {
        failed = true; ready = false
        waiting.toList().forEach { reject(it) }; waiting.clear()
        stopCurrent(); engine?.shutdown(); engine = null
      }
    }
  }
}

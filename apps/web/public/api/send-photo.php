<?php

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

function respond(int $status, array $payload): void
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_SLASHES);
    exit;
}

function environment_value(string $name): string
{
    $value = getenv($name);
    return $value === false ? '' : trim($value);
}

if ($_SERVER['REQUEST_METHOD'] ?? '' !== 'POST') {
    header('Allow: POST');
    respond(405, ['error' => 'Only POST is supported.']);
}

$allowedOrigin = environment_value('SMART_SMILE_ALLOWED_ORIGIN');
$origin = trim((string) ($_SERVER['HTTP_ORIGIN'] ?? ''));
if ($allowedOrigin !== '' && $origin !== '' && !hash_equals($allowedOrigin, $origin)) {
    respond(403, ['error' => 'This origin is not allowed.']);
}

$rawBody = file_get_contents('php://input');
$payload = json_decode($rawBody === false ? '' : $rawBody, true);
if (!is_array($payload)) {
    respond(400, ['error' => 'Request body must be JSON.']);
}

$email = filter_var($payload['email'] ?? '', FILTER_VALIDATE_EMAIL);
$consent = ($payload['consent'] ?? false) === true;
$image = is_string($payload['image'] ?? null) ? $payload['image'] : '';
$idempotencyKey = is_string($payload['idempotencyKey'] ?? null)
    ? $payload['idempotencyKey']
    : trim((string) ($_SERVER['HTTP_IDEMPOTENCY_KEY'] ?? ''));

if ($email === false || !$consent || $image === '') {
    respond(422, ['error' => 'A valid email, photo, and consent are required.']);
}
if (strlen($idempotencyKey) < 8 || strlen($idempotencyKey) > 128 || !preg_match('/^[A-Za-z0-9._:-]+$/', $idempotencyKey)) {
    respond(422, ['error' => 'The delivery request is invalid.']);
}

if (!preg_match('#^data:(image/(?:jpeg|jpg|png));base64,([A-Za-z0-9+/=]+)$#', $image, $imageParts)) {
    respond(422, ['error' => 'Only JPEG and PNG photos are supported.']);
}

$imageBytes = base64_decode($imageParts[2], true);
if ($imageBytes === false || strlen($imageBytes) === 0 || strlen($imageBytes) > 8 * 1024 * 1024) {
    respond(422, ['error' => 'The photo is too large or invalid.']);
}

$ratePath = sys_get_temp_dir() . '/smart-smile-rate-' . hash('sha256', (string) ($_SERVER['REMOTE_ADDR'] ?? 'unknown'));
$rateHandle = @fopen($ratePath, 'c+');
if ($rateHandle !== false) {
    $now = time();
    $rateData = json_decode((string) stream_get_contents($rateHandle), true);
    $recentRequests = is_array($rateData) && isset($rateData['timestamps']) && is_array($rateData['timestamps'])
        ? array_values(array_filter($rateData['timestamps'], static fn ($timestamp): bool => is_int($timestamp) && $timestamp > $now - 900))
        : [];
    if (count($recentRequests) >= 5) {
        flock($rateHandle, LOCK_UN);
        fclose($rateHandle);
        respond(429, ['error' => 'Please wait before sending another photo.']);
    }
    $recentRequests[] = $now;
    ftruncate($rateHandle, 0);
    rewind($rateHandle);
    fwrite($rateHandle, json_encode(['timestamps' => $recentRequests]));
    fflush($rateHandle);
    flock($rateHandle, LOCK_UN);
    fclose($rateHandle);
}

$apiKey = environment_value('RESEND_API_KEY');
$from = environment_value('SMART_SMILE_FROM');
if ($apiKey === '' || $from === '') {
    respond(503, ['error' => 'Email service is not configured on this server.']);
}
if (!function_exists('curl_init')) {
    respond(503, ['error' => 'The PHP server is missing cURL.']);
}

$temporaryPhoto = tempnam(sys_get_temp_dir(), 'smart-smile-');
if ($temporaryPhoto === false || file_put_contents($temporaryPhoto, $imageBytes) === false) {
    if ($temporaryPhoto !== false) @unlink($temporaryPhoto);
    respond(500, ['error' => 'The photo could not be prepared.']);
}

$resendPayload = json_encode([
    'from' => $from,
    'to' => [$email],
    'subject' => 'Your Smart Smile photo',
    'html' => '<p>Thanks for taking a Smart Smile photo.</p>',
    'attachments' => [[
        'content' => base64_encode($imageBytes),
        'filename' => 'smart-smile.' . ($imageParts[1] === 'image/png' ? 'png' : 'jpg'),
    ]],
]);

$curl = curl_init('https://api.resend.com/emails');
curl_setopt_array($curl, [
    CURLOPT_POST => true,
    CURLOPT_POSTFIELDS => $resendPayload,
    CURLOPT_HTTPHEADER => [
        'Accept: application/json',
        'Authorization: Bearer ' . $apiKey,
        'Content-Type: application/json',
        'Idempotency-Key: ' . $idempotencyKey,
    ],
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT => 20,
]);
$responseBody = curl_exec($curl);
$responseStatus = (int) curl_getinfo($curl, CURLINFO_HTTP_CODE);
$curlError = curl_error($curl);
curl_close($curl);
@unlink($temporaryPhoto);

if ($responseBody === false || $curlError !== '' || $responseStatus < 200 || $responseStatus >= 300) {
    respond(502, ['error' => 'The email provider could not send the photo.']);
}

$providerResponse = json_decode($responseBody, true);
respond(200, [
    'id' => is_array($providerResponse) && is_string($providerResponse['id'] ?? null)
        ? $providerResponse['id']
        : null,
    'ok' => true,
]);


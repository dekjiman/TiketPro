Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead('D:\workspace\evenpro\PRD_tiketPro.md')
$entry = $zip.Entries | Where-Object { $_.FullName -eq 'word/document.xml' }
$stream = $entry.Open()
$reader = New-Object System.IO.StreamReader($stream)
$content = $reader.ReadToEnd()
$reader.Close()
$stream.Close()
$zip.Dispose()
$content -replace '<[^>]+>', ' ' -replace '\s+', ' ' | Out-File -FilePath 'D:\workspace\evenpro\PRD_tiketPro.md' -Encoding UTF8
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Image,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { getColors, Spacing, FontSizes, FontWeights, BorderRadius } from '../theme';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { createReport } from '../api/reports';
import { validateReportForm, REPORT_CATEGORIES, REPORT_CONTENT_TYPES } from '../utils/reportHelpers';
import { ReportContentType, ReportCategory, Report } from '../types/database';

interface ReportModalProps {
  isVisible: boolean;
  onClose: () => void;
  contentType: ReportContentType;
  reportedUserId?: string;
  reportedContentId?: string;
  onSuccess?: (report: Report) => void;
}

export const ReportModal: React.FC<ReportModalProps> = ({
  isVisible,
  onClose,
  contentType,
  reportedUserId,
  reportedContentId,
  onSuccess,
}) => {
  const { isDark } = useTheme();
  const { user } = useAuth();
  const Colors = getColors(isDark);

  const [step, setStep] = useState<'type' | 'category' | 'details' | 'success'>('category');
  const [category, setCategory] = useState<ReportCategory | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [imageUris, setImageUris] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleCategorySelect = (selectedCategory: ReportCategory) => {
    setCategory(selectedCategory);
    setStep('details');
  };

  const handleAddImage = async () => {
    // In a real app, use react-native-image-picker or similar
    // For now, we'll show a placeholder
    Alert.alert('Add Image', 'Integration with image picker needed');
  };

  const handleRemoveImage = (index: number) => {
    setImageUris((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!user) {
      Alert.alert('Error', 'You must be logged in to submit a report');
      return;
    }

    // Validate form
    const validation = validateReportForm({
      title,
      description,
      category: category || '',
      contentType,
    });

    if (!validation.isValid) {
      setErrors(validation.errors);
      return;
    }

    setLoading(true);

    try {
      const report = await createReport({
        reporter_id: user.id,
        reported_content_type: contentType,
        category: category!,
        title: title.trim(),
        description: description.trim(),
        reported_user_id: reportedUserId,
        reported_content_id: reportedContentId,
        image_urls: imageUris,
        additional_info: {
          user_agent: Platform.OS,
        },
      });

      setStep('success');
      setTimeout(() => {
        resetForm();
        onClose();
        onSuccess?.(report);

        Alert.alert('Success', 'Your report has been submitted. Our team will review it shortly.');
      }, 2000);
    } catch (error) {
      console.error('Error submitting report:', error);
      Alert.alert('Error', 'Failed to submit report. Please try again.');
      setLoading(false);
    }
  };

  const resetForm = () => {
    setStep('category');
    setCategory(null);
    setTitle('');
    setDescription('');
    setImageUris([]);
    setErrors({});
  };

  if (!isVisible) return null;

  return (
    <View style={[styles.overlay, { backgroundColor: 'rgba(0,0,0,0.5)' }]}>
      <View style={[styles.modal, { backgroundColor: Colors.card }]}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: Colors.border }]}>
          <Text style={[styles.title, { color: Colors.text }]}>Report {contentType}</Text>
          <TouchableOpacity
            onPress={() => {
              resetForm();
              onClose();
            }}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text style={[styles.closeButton, { color: Colors.primary }]}>✕</Text>
          </TouchableOpacity>
        </View>

        {/* Content */}
        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {step === 'category' && (
            <View style={styles.stepContainer}>
              <Text style={[styles.stepTitle, { color: Colors.text }]}>What's the issue?</Text>
              <Text style={[styles.stepDescription, { color: Colors.textSecondary }]}>  
                Select the category that best describes the problem
              </Text>

              <View style={styles.categoriesGrid}>
                {REPORT_CATEGORIES.map((cat) => (
                  <TouchableOpacity
                    key={cat.value}
                    style={[
                      styles.categoryCard,
                      {
                        backgroundColor: Colors.background,
                        borderColor: Colors.border,
                      },
                      category === cat.value && {
                        backgroundColor: Colors.primary,
                        borderColor: Colors.primary,
                      },
                    ]}
                    onPress={() => handleCategorySelect(cat.value)}
                  >
                    <Text
                      style={[
                        styles.categoryLabel,
                        {
                          color: category === cat.value ? '#FFF' : Colors.text,
                        },
                      ]}
                    >
                      {cat.label}
                    </Text>
                    <Text
                      style={[
                        styles.categoryDescription,
                        {
                          color: category === cat.value ? 'rgba(255,255,255,0.8)' : Colors.textSecondary,
                        },
                      ]}
                    >
                      {cat.description}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {step === 'details' && category && (
            <View style={styles.stepContainer}>
              <Text style={[styles.stepTitle, { color: Colors.text }]}>Report details</Text>

              {/* Title Input */}
              <View>
                <Text style={[styles.label, { color: Colors.text }]}>Title *</Text>
                <TextInput
                  style={[
                    styles.input,
                    {
                      borderColor: errors.title ? '#EF4444' : Colors.border,
                      color: Colors.text,
                      backgroundColor: Colors.background,
                    },
                  ]}
                  placeholder="Brief title of the issue"
                  placeholderTextColor={Colors.textSecondary}
                  value={title}
                  onChangeText={(text) => {
                    setTitle(text);
                    if (errors.title) setErrors((prev) => ({ ...prev, title: '' }));
                  }}
                  maxLength={150}
                />
                {errors.title && <Text style={styles.errorText}>{errors.title}</Text>}
                <Text style={[styles.charCount, { color: Colors.textSecondary }]}>
                  {title.length}/150
                </Text>
              </View>

              {/* Description Input */}
              <View style={{ marginTop: 16 }}>
                <Text style={[styles.label, { color: Colors.text }]}>Description *</Text>
                <TextInput
                  style={[
                    styles.textarea,
                    {
                      borderColor: errors.description ? '#EF4444' : Colors.border,
                      color: Colors.text,
                      backgroundColor: Colors.background,
                    },
                  ]}
                  placeholder="Provide detailed information about the issue"
                  placeholderTextColor={Colors.textSecondary}
                  value={description}
                  onChangeText={(text) => {
                    setDescription(text);
                    if (errors.description) setErrors((prev) => ({ ...prev, description: '' }));
                  }}
                  multiline
                  numberOfLines={6}
                  maxLength={2000}
                  textAlignVertical="top"
                />
                {errors.description && <Text style={styles.errorText}>{errors.description}</Text>}
                <Text style={[styles.charCount, { color: Colors.textSecondary }]}>
                  {description.length}/2000
                </Text>
              </View>

              {/* Image Upload */}
              <View style={{ marginTop: 16 }}>
                <Text style={[styles.label, { color: Colors.text }]}>Add Images (Optional)</Text>
                <Text style={[styles.helperText, { color: Colors.textSecondary }]}>  
                  Add up to 5 images as evidence
                </Text>

                <View style={styles.imageGrid}>
                  {imageUris.map((uri, index) => (
                    <View key={index} style={styles.imageContainer}>
                      <Image source={{ uri }} style={styles.image} />
                      <TouchableOpacity
                        style={styles.removeImageButton}
                        onPress={() => handleRemoveImage(index)}
                      >
                        <Text style={styles.removeImageButtonText}>✕</Text>
                      </TouchableOpacity>
                    </View>
                  ))}

                  {imageUris.length < 5 && (
                    <TouchableOpacity
                      style={[
                        styles.addImageButton,
                        {
                          borderColor: Colors.primary,
                          backgroundColor: 'rgba(59, 130, 246, 0.1)',
                        },
                      ]}
                      onPress={handleAddImage}
                    >
                      <Text style={[styles.addImageButtonText, { color: Colors.primary }]}>  
                        + Add Image
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              {/* Anonymous Option */}
              <View
                style={[
                  styles.infoBox,
                  { backgroundColor: 'rgba(59, 130, 246, 0.1)', borderColor: Colors.primary },
                ]}
              >
                <Text style={[styles.infoText, { color: Colors.text }]}>  
                  📋 Your identity will be kept confidential unless necessary for legal action.
                </Text>
              </View>
            </View>
          )}

          {step === 'success' && (
            <View style={styles.successContainer}>
              <Text style={styles.successIcon}>✅</Text>
              <Text style={[styles.successTitle, { color: Colors.text }]}>Report Submitted</Text>
              <Text style={[styles.successDescription, { color: Colors.textSecondary }]}>  
                Thank you for helping us keep CampUs safe. Our moderation team will review your report shortly.
              </Text>
            </View>
          )}
        </ScrollView>

        {/* Footer */}
        {step !== 'success' && (
          <View style={[styles.footer, { borderTopColor: Colors.border }]}>  
            {step === 'details' && (
              <>
                <TouchableOpacity
                  style={[styles.secondaryButton, { borderColor: Colors.primary }]}
                  onPress={() => setStep('category')}
                  disabled={loading}
                >
                  <Text style={[styles.secondaryButtonText, { color: Colors.primary }]}>  
                    Back
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.primaryButton, { backgroundColor: Colors.primary }]}
                  onPress={handleSubmit}
                  disabled={loading}
                >  
                  {loading ? (
                    <ActivityIndicator color="#FFF" />
                  ) : (
                    <Text style={styles.primaryButtonText}>Submit Report</Text>
                  )}
                </TouchableOpacity>
              </>
            )}

            {step === 'category' && (
              <TouchableOpacity
                style={[styles.primaryButton, { backgroundColor: Colors.primary }]}
                onPress={() => {
                  if (category) handleCategorySelect(category);
                }}
                disabled={!category}
              >
                <Text style={styles.primaryButtonText}>Continue</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
  },
  modal: {
    maxHeight: '90%',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
  },
  closeButton: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  content: {
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  stepContainer: {
    marginBottom: 16,
  },
  stepTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 6,
  },
  stepDescription: {
    fontSize: 14,
    marginBottom: 16,
  },
  categoriesGrid: {
    gap: 12,
  },
  categoryCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
  },
  categoryLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  categoryDescription: {
    fontSize: 12,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    marginBottom: 4,
  },
  textarea: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    marginBottom: 4,
  },
  charCount: {
    fontSize: 12,
    textAlign: 'right',
    marginBottom: 12,
  },
  errorText: {
    color: '#EF4444',
    fontSize: 12,
    marginBottom: 4,
  },
  helperText: {
    fontSize: 12,
    marginBottom: 12,
  },
  imageGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  imageContainer: {
    position: 'relative',
    width: '23%',
    aspectRatio: 1,
    borderRadius: 8,
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  removeImageButton: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 12,
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeImageButtonText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  addImageButton: {
    width: '23%',
    aspectRatio: 1,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addImageButtonText: {
    fontSize: 12,
    fontWeight: '600',
  },
  infoBox: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginTop: 12,
  },
  infoText: {
    fontSize: 13,
    lineHeight: 20,
  },
  footer: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
  },
  primaryButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
  },
  secondaryButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
  },
  secondaryButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  successContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  successIcon: {
    fontSize: 60,
    marginBottom: 16,
  },
  successTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  successDescription: {
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: 16,
  },
});

export default ReportModal;
